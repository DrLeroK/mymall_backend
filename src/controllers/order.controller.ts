import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { InventoryService } from '../services/inventoryService';
import { OrderStatus, PaymentProofStatus, AlertType, Role, OrderType } from '@prisma/client';
import { notifyStore, notifyUser } from '../sockets/socket';
import { ChapaService } from '../services/chapaService';
import { Validator } from '../utils/validator';

export class OrderController {
  /**
   * Online Cart Checkout (Customer-facing per store)
   * Supports DELIVERY (map coordinates or written address) vs PICKUP,
   * and payment via SCREENSHOT or CHAPA
   */
  static async checkout(req: Request, res: Response) {
    try {
      let {
        storeId,
        customerName,
        customerEmail,
        customerPhone,
        orderType = 'DELIVERY',
        shippingAddress,
        addressId,
        deliveryLatitude,
        deliveryLongitude,
        locationPermissionGranted = false,
        locationAccuracy,
        deliveryInstructions,
        paymentMethod = 'BANK_TRANSFER_SCREENSHOT',
        notes,
        items,
        callbackUrl,
        returnUrl,
      } = req.body;

      if (!storeId || !customerName || !customerEmail || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Missing required checkout fields (storeId, customerName, customerEmail, customerPhone, items).' });
      }

      const store = await prisma.store.findUnique({
        where: { id: parseInt(storeId, 10) },
        include: { bankAccounts: { where: { isActive: true } } },
      });

      if (!store) {
        return res.status(404).json({ success: false, message: 'Store not found.' });
      }

      if (paymentMethod === 'CHAPA' && (!store.chapaSecretKey || !store.chapaPublicKey)) {
        return res.status(400).json({
          success: false,
          message: 'This store has not configured Chapa online payment. Please select Bank Transfer with Screenshot.',
        });
      }

      // Validate Contact Information
      if (!Validator.validateEmail(customerEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address.',
        });
      }

      if (paymentMethod === 'CHAPA') {
        if (!Validator.validateEthiopianPhone(customerPhone)) {
          return res.status(400).json({
            success: false,
            message: 'A valid 10-digit Ethiopian mobile number (09xxxxxxxx or 07xxxxxxxx) is required for Chapa payment.',
          });
        }
        customerPhone = Validator.normalizeEthiopianPhone(customerPhone) || customerPhone;
      } else if (Validator.validateEthiopianPhone(customerPhone)) {
        customerPhone = Validator.normalizeEthiopianPhone(customerPhone) || customerPhone;
      }

      // If addressId is provided, pull saved address and verified coordinates
      if (addressId) {
        const savedAddress = await prisma.customerAddress.findUnique({
          where: { id: parseInt(addressId, 10) },
        });
        if (savedAddress) {
          shippingAddress = shippingAddress || `${savedAddress.streetAddress}, ${savedAddress.city || ''}`;
          if (savedAddress.latitude && savedAddress.longitude) {
            deliveryLatitude = savedAddress.latitude;
            deliveryLongitude = savedAddress.longitude;
            locationPermissionGranted = savedAddress.locationPermissionGranted;
            locationAccuracy = savedAddress.locationAccuracy ?? undefined;
          }
          if (savedAddress.deliveryInstructions) {
            deliveryInstructions = deliveryInstructions || savedAddress.deliveryInstructions;
          }
        }
      }

      // Fulfillment Validation: DELIVERY vs PICKUP
      const isDelivery = orderType === 'DELIVERY';
      if (isDelivery) {
        const hasCoordinates = deliveryLatitude !== undefined && deliveryLongitude !== undefined && deliveryLatitude !== null && deliveryLongitude !== null;
        const hasWrittenAddress = Boolean(shippingAddress && shippingAddress.trim().length > 0);

        if (!hasCoordinates && !hasWrittenAddress) {
          return res.status(400).json({
            success: false,
            message: 'For delivery orders, please provide your delivery location using either GPS map coordinates (latitude/longitude) or a written shipping address.',
          });
        }

        // PERMISSION CHECK: Verify explicit location permission when coordinates are submitted
        if (hasCoordinates) {
          if (!locationPermissionGranted) {
            return res.status(400).json({
              success: false,
              message: 'Location sharing permission was not granted. Please allow your browser/device to share location or provide a written street address.',
            });
          }

          const coordCheck = Validator.validateCoordinates(deliveryLatitude, deliveryLongitude);
          if (!coordCheck.isValid) {
            return res.status(400).json({ success: false, message: coordCheck.message });
          }
        }
      }

      const orderNumber = `ORD-${store.id}-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const chapaTxRef = paymentMethod === 'CHAPA'
        ? `ORD-${store.id}-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`
        : null;

      const order = await prisma.$transaction(async (tx) => {
        let subtotal = 0;
        const orderItemsData = [];

        for (const item of items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) throw new Error(`Product ${item.productId} not found.`);

          const unitPrice = item.variantId ? item.price || Number(product.sellingPrice) : Number(product.sellingPrice);
          const itemSubtotal = item.quantity * unitPrice;
          subtotal += itemSubtotal;

          // Decrement stock atomically
          await InventoryService.decrementStock(tx, store.id, item.productId, item.quantity, item.variantId);

          orderItemsData.push({
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity,
            unitPrice,
            subtotal: itemSubtotal,
          });
        }

        const taxRate = Number(store.taxRate) || 0;
        const taxAmount = (subtotal * taxRate) / 100;
        const shippingCost = isDelivery ? 5.00 : 0.00;
        const totalAmount = subtotal + taxAmount + shippingCost;

        const customerId = req.user ? req.user.id : null;

        const createdOrder = await tx.order.create({
          data: {
            orderNumber,
            storeId: store.id,
            customerId,
            customerName,
            customerEmail: customerEmail.toLowerCase().trim(),
            customerPhone,
            orderType: isDelivery ? OrderType.DELIVERY : OrderType.PICKUP,
            shippingAddress: isDelivery ? shippingAddress || 'Map GPS Coordinates Provided' : null,
            deliveryLatitude: isDelivery && deliveryLatitude ? parseFloat(deliveryLatitude) : null,
            deliveryLongitude: isDelivery && deliveryLongitude ? parseFloat(deliveryLongitude) : null,
            locationPermissionGranted: isDelivery && deliveryLatitude ? Boolean(locationPermissionGranted) : false,
            locationAccuracy: isDelivery && locationAccuracy ? parseFloat(locationAccuracy) : null,
            deliveryInstructions: isDelivery ? deliveryInstructions : null,
            pickupStoreAddress: !isDelivery ? store.address || 'Store Main Location' : null,
            subtotal,
            taxAmount,
            shippingCost,
            totalAmount,
            status: OrderStatus.PENDING,
            paymentMethod,
            chapaTxRef,
            notes,
            items: { create: orderItemsData },
          },
          include: { items: { include: { product: true } } },
        });

        // Trigger Alert for Store Owner
        await tx.alert.create({
          data: {
            storeId: store.id,
            type: AlertType.NEW_ORDER,
            title: `New Online Order #${createdOrder.orderNumber}`,
            message: `New order (${isDelivery ? 'Delivery' : 'Pickup'}) from ${customerName} for ${store.currency} ${totalAmount.toFixed(2)}.`,
          },
        });

        return createdOrder;
      });

      // Real-time socket notification to store dashboard and customer
      notifyStore(store.id, 'order:new', { order });
      if (order.customerId) {
        notifyUser(order.customerId, 'order:created', { order });
      }

      // Handle Chapa Payment Gateway Initialization if selected
      let chapaCheckoutData = null;
      if (paymentMethod === 'CHAPA' && chapaTxRef) {
        const [firstName, ...rest] = customerName.split(' ');
        const lastName = rest.join(' ') || 'Customer';

        const storeChapaKey = store.chapaSecretKey || null;
        const emailToUse = order.customerEmail.includes('@example.com')
          ? (process.env.SMTP_USER || 'customer@mymall.com')
          : order.customerEmail;

        const chapaRes = await ChapaService.initializePayment({
          amount: order.totalAmount.toString(),
          currency: store.currency === 'USD' ? 'USD' : 'ETB',
          email: emailToUse,
          firstName,
          lastName,
          phoneNumber: customerPhone,
          txRef: chapaTxRef,
          callbackUrl,
          returnUrl,
          title: 'MyMall Order',
          description: `Online Order Payment`,
        }, storeChapaKey);

        if (chapaRes.success && chapaRes.data) {
          chapaCheckoutData = {
            checkoutUrl: chapaRes.data.checkoutUrl,
            txRef: chapaTxRef,
          };
        }
      }

      return res.status(201).json({
        success: true,
        message: paymentMethod === 'CHAPA'
          ? 'Order created. Please complete payment via Chapa checkout.'
          : 'Order created successfully. Please transfer to the store bank account and upload your payment proof.',
        order,
        checkoutUrl: chapaCheckoutData?.checkoutUrl || null,
        chapaCheckout: chapaCheckoutData,
        storeBankAccounts: paymentMethod === 'BANK_TRANSFER_SCREENSHOT' ? store.bankAccounts : undefined,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Verify Chapa Online Order Payment
   */
  static async verifyChapaOrder(req: Request, res: Response) {
    try {
      const { txRef } = req.params;

      const order = await prisma.order.findUnique({
        where: { chapaTxRef: txRef },
        include: { store: true },
      });

      if (!order) {
        return res.status(404).json({ success: false, message: 'Order transaction not found.' });
      }

      if (order.status === OrderStatus.PAID) {
        return res.json({ success: true, message: 'Order already marked as paid.', order });
      }

      const storeChapaKey = order.store.chapaSecretKey || null;
      const chapaRes = await ChapaService.verifyPayment(txRef, storeChapaKey);
      const isSimulate = process.env.NODE_ENV !== 'production' && req.query.simulateSuccess === 'true';

      if (!isSimulate && (!chapaRes.success || chapaRes.status !== 'success')) {
        return res.status(400).json({ success: false, message: 'Payment verification failed with Chapa or is still pending.' });
      }

      // Mark Order as PAID
      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paymentProofStatus: PaymentProofStatus.VERIFIED,
          paymentProofNotes: 'Automated instant verification via Chapa payment gateway.',
        },
      });

      // Notify Store & Customer
      notifyStore(order.storeId, 'order:status_updated', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: OrderStatus.PAID,
      });
      if (order.customerId) {
        notifyUser(order.customerId, 'order:status_updated', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: OrderStatus.PAID,
        });
      }

      return res.json({
        success: true,
        message: 'Order payment verified successfully via Chapa! Order is now PAID.',
        order: updatedOrder,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Submit Customer Payment Proof Screenshot
   */
  static async uploadPaymentProof(req: Request, res: Response) {
    try {
      const orderId = parseInt(req.params.id, 10);
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Screenshot file is required.' });
      }

      const paymentProofUrl = `/uploads/screenshots/${req.file.filename}`;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentProofUrl,
          paymentProofStatus: PaymentProofStatus.SUBMITTED,
          status: OrderStatus.AWAITING_VERIFICATION,
        },
      });

      await prisma.alert.create({
        data: {
          storeId: order.storeId,
          type: AlertType.PAYMENT_SUBMITTED,
          title: `Payment Proof Uploaded for Order #${order.orderNumber}`,
          message: `Customer ${order.customerName} submitted payment screenshot for review.`,
        },
      });

      notifyStore(order.storeId, 'payment:proof_submitted', { orderId, orderNumber: order.orderNumber, paymentProofUrl });

      return res.json({
        success: true,
        message: 'Payment verification screenshot uploaded successfully. Awaiting merchant approval.',
        order: updatedOrder,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Merchant / Store Staff Approve or Reject Customer Payment Proof
   */
  static async verifyPayment(req: Request, res: Response) {
    try {
      const storeId = req.storeId;
      const orderId = parseInt(req.params.id, 10);
      const { action, notes } = req.body; // action: "APPROVE" or "REJECT"

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || (storeId && order.storeId !== storeId && req.user?.role !== Role.SUPER_ADMIN)) {
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }

      if (action === 'APPROVE') {
        const updated = await prisma.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.PAID,
            paymentProofStatus: PaymentProofStatus.VERIFIED,
            paymentProofNotes: notes || 'Payment proof verified by merchant.',
            verifiedById: req.user!.id,
          },
        });

        notifyStore(order.storeId, 'order:status_updated', { orderId, status: OrderStatus.PAID });
        if (order.customerId) {
          notifyUser(order.customerId, 'order:status_updated', {
            orderId,
            orderNumber: order.orderNumber,
            status: OrderStatus.PAID,
          });
        }

        return res.json({ success: true, message: 'Payment approved. Order marked as PAID.', order: updated });
      } else {
        const updated = await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentProofStatus: PaymentProofStatus.REJECTED,
            paymentProofNotes: notes || 'Payment proof rejected by merchant.',
            status: OrderStatus.PENDING,
          },
        });

        if (order.customerId) {
          notifyUser(order.customerId, 'payment:rejected', {
            orderId,
            orderNumber: order.orderNumber,
            notes,
          });
        }

        return res.json({ success: true, message: 'Payment proof rejected.', order: updated });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update Order Status Pipeline (Store Admin / Staff)
   */
  static async updateOrderStatus(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const orderId = parseInt(req.params.id, 10);
      const { status } = req.body;

      if (!Object.values(OrderStatus).includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid order status value.' });
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order || (storeId && order.storeId !== storeId && req.user?.role !== Role.SUPER_ADMIN)) {
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }

      // If cancelling order, restore inventory stock
      if (status === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED) {
        await prisma.$transaction(async (tx) => {
          for (const item of order.items) {
            await InventoryService.restoreStock(tx, order.storeId, item.productId, item.quantity, item.variantId);
          }
        });
      }

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { status: status as OrderStatus },
      });

      notifyStore(order.storeId, 'order:status_updated', { orderId, status });
      if (order.customerId) {
        notifyUser(order.customerId, 'order:status_updated', {
          orderId,
          orderNumber: order.orderNumber,
          status,
        });
      }

      return res.json({ success: true, message: `Order status updated to ${status}.`, order: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * List Orders for Store Admin / Staff
   */
  static async listOrders(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { status } = req.query;

      const whereClause: any = { storeId };
      if (status) whereClause.status = status as OrderStatus;

      const orders = await prisma.order.findMany({
        where: whereClause,
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, count: orders.length, orders });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Single Order Details
   */
  static async getOrder(req: Request, res: Response) {
    try {
      const orderId = parseInt(req.params.id, 10);
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          store: {
            select: {
              id: true,
              name: true,
              slug: true,
              address: true,
              contactPhone: true,
              currency: true,
              bankAccounts: { where: { isActive: true } },
            },
          },
          items: { include: { product: true, variant: true } },
          verifiedBy: { select: { id: true, name: true } },
        },
      });

      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
      return res.json({ success: true, order });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
