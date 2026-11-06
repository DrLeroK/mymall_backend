import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { InventoryService } from '../services/inventoryService';
import { OrderStatus, PaymentProofStatus, AlertType, Role, OrderType } from '@prisma/client';
import { notifyStore, notifyUser } from '../sockets/socket';
import { ChapaService } from '../services/chapaService';
import { StorageService } from '../services/storageService';
import { ReceiptService } from '../services/receiptService';
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
        const storeDeliveryFee = store.deliveryFee !== undefined && store.deliveryFee !== null ? Number(store.deliveryFee) : 50.00;
        const shippingCost = isDelivery ? storeDeliveryFee : 0.00;
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
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const cleanEmail = (order.customerEmail || '').replace(/['"]/g, '').trim();
        const smtpEmail = (process.env.SMTP_USER || '').replace(/['"]/g, '').trim();
        const emailToUse = (cleanEmail && emailRegex.test(cleanEmail) && !cleanEmail.endsWith('@example.com'))
          ? cleanEmail
          : (smtpEmail && emailRegex.test(smtpEmail))
            ? smtpEmail
            : 'customer@mymall.et';

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3003';
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
        const finalReturnUrl = returnUrl || `${frontendUrl}/orders/${order.id}?payment=chapa_success&txRef=${chapaTxRef}`;
        const finalCallbackUrl = callbackUrl || `${backendUrl}/api/v1/orders/chapa/verify/${chapaTxRef}`;

        const chapaRes = await ChapaService.initializePayment({
          amount: order.totalAmount.toString(),
          currency: 'ETB',
          email: emailToUse,
          firstName,
          lastName,
          phoneNumber: customerPhone,
          txRef: chapaTxRef,
          callbackUrl: finalCallbackUrl,
          returnUrl: finalReturnUrl,
          title: 'MyMall Order',
          description: `Online Order Payment #${order.orderNumber}`,
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
        include: {
          store: true,
          items: { include: { product: true } },
        },
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

      // Generate official digital order receipt document and save to paymentProofUrl
      let receiptUrl = 'CHAPA_GATEWAY';
      try {
        receiptUrl = await ReceiptService.generateOrderReceiptFile({
          storeName: order.store.name,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          items: order.items.map((it) => ({
            name: it.product?.name || `Product #${it.productId}`,
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice),
            subtotal: Number(it.subtotal || it.quantity * Number(it.unitPrice)),
          })),
          subtotal: Number(order.subtotal),
          taxAmount: Number(order.taxAmount || 0),
          shippingCost: Number(order.shippingCost || 0),
          totalAmount: Number(order.totalAmount),
          currency: order.store.currency,
          txRef,
          paymentDate: new Date(),
          shippingAddress: order.shippingAddress,
        });
      } catch (receiptErr: any) {
        console.warn('Could not generate digital order receipt file:', receiptErr.message);
      }

      // Mark Order as PAID and save receipt proof
      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paymentProofStatus: PaymentProofStatus.VERIFIED,
          paymentProofUrl: receiptUrl,
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

      const paymentProofUrl = await StorageService.uploadFile(req.file, 'screenshots');

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
   * List Personal Customer Orders (Accessible by any authenticated user: Customer, Staff, Store Owner, Admin)
   */
  static async getMyOrders(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      const { status, page: pageQuery, limit: limitQuery } = req.query;

      const whereClause: any = {
        OR: [
          { customerId: req.user.id },
          { customerEmail: req.user.email.toLowerCase().trim() },
        ],
      };

      if (status) whereClause.status = status as OrderStatus;

      const total = await prisma.order.count({ where: whereClause });

      const page = pageQuery ? Math.max(1, parseInt(pageQuery as string, 10)) : undefined;
      const isUnlimited = limitQuery === 'all' || limitQuery === '0';
      const limit = isUnlimited
        ? undefined
        : limitQuery
          ? Math.max(1, parseInt(limitQuery as string, 10))
          : (page ? 10 : undefined);

      const findArgs: any = {
        where: whereClause,
        include: {
          store: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              address: true,
              contactPhone: true,
              currency: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  images: true,
                  sellingPrice: true,
                  sku: true,
                },
              },
              variant: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      };

      if (page && limit) {
        findArgs.skip = (page - 1) * limit;
        findArgs.take = limit;
      }

      const orders = await prisma.order.findMany(findArgs);

      return res.json({
        success: true,
        count: orders.length,
        total,
        page: page || 1,
        totalPages: limit ? Math.ceil(total / limit) : 1,
        limit: limit || total,
        orders,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * List Orders for Store Admin / Staff
   */
  static async listOrders(req: Request, res: Response) {
    try {
      const { status, page: pageQuery, limit: limitQuery, scope } = req.query;

      let whereClause: any = {};

      if (req.user && (scope === 'personal' || req.query.personal === 'true' || req.user.role === Role.CUSTOMER)) {
        whereClause.OR = [
          { customerId: req.user.id },
          { customerEmail: req.user.email.toLowerCase() },
        ];
      } else if (req.storeId) {
        whereClause.storeId = req.storeId;
      } else if (req.user?.role === Role.STORE_OWNER || req.user?.role === Role.STORE_STAFF) {
        return res.status(400).json({
          success: false,
          message: 'Store context is required to list store orders.',
        });
      }

      if (status) whereClause.status = status as OrderStatus;

      const total = await prisma.order.count({ where: whereClause });

      const page = pageQuery ? Math.max(1, parseInt(pageQuery as string, 10)) : undefined;
      const isUnlimited = limitQuery === 'all' || limitQuery === '0';
      const limit = isUnlimited
        ? undefined
        : limitQuery
          ? Math.max(1, parseInt(limitQuery as string, 10))
          : (page ? 10 : undefined);

      const findArgs: any = {
        where: whereClause,
        include: {
          store: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              address: true,
              contactPhone: true,
            },
          },
          items: { include: { product: true, variant: true } },
        },
        orderBy: { createdAt: 'desc' },
      };

      if (page && limit) {
        findArgs.skip = (page - 1) * limit;
        findArgs.take = limit;
      }

      const orders = await prisma.order.findMany(findArgs);

      return res.json({
        success: true,
        count: orders.length,
        total,
        page: page || 1,
        totalPages: limit ? Math.ceil(total / limit) : 1,
        limit: limit || total,
        orders,
      });
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

  /**
   * Sales Report: Unified Online Storefront & Offline POS Sales Stream
   */
  static async getSalesReport(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const channel = ((req.query.channel as string) || 'ALL').toUpperCase();
      const search = ((req.query.search as string) || '').trim().toLowerCase();

      // 1. Fetch Online Orders
      const onlineOrders = await prisma.order.findMany({
        where: { storeId },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, costPrice: true } },
              variant: { select: { id: true, name: true, sku: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // 2. Fetch Offline POS Sales
      const posSales = await prisma.pOSSale.findMany({
        where: { storeId },
        include: {
          cashier: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, costPrice: true } },
              variant: { select: { id: true, name: true, sku: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Map Online Orders into standard sales records
      const mappedOnline = onlineOrders.map((o) => {
        const totalCost = o.items.reduce((acc: number, it: any) => acc + (Number(it.product.costPrice || 0) * it.quantity), 0);
        const amount = Number(o.totalAmount);
        return {
          id: `online_${o.id}`,
          rawId: o.id,
          channel: 'ONLINE' as const,
          referenceNumber: o.orderNumber,
          customerName: o.customerName || 'Online Customer',
          customerPhone: o.customerPhone || '—',
          amount,
          costAmount: Number(totalCost.toFixed(2)),
          netProfit: Number((amount - totalCost).toFixed(2)),
          paymentMethod: o.paymentMethod,
          status: o.status,
          itemCount: o.items.reduce((acc: number, it: any) => acc + it.quantity, 0),
          createdAt: o.createdAt,
          items: o.items.map((it: any) => ({
            name: it.product.name,
            variantName: it.variant?.name,
            quantity: it.quantity,
            price: Number(it.unitPrice),
            subtotal: Number(it.subtotal),
          })),
        };
      });

      // Map Offline POS Sales into standard sales records
      const mappedOffline = posSales.map((s: any) => {
        const totalCost = s.items.reduce((acc: number, it: any) => acc + (Number(it.product.costPrice || 0) * it.quantity), 0);
        const amount = Number(s.netAmount);
        return {
          id: `offline_${s.id}`,
          rawId: s.id,
          channel: 'OFFLINE' as const,
          referenceNumber: s.receiptNumber,
          customerName: s.customerName || 'Walk-in Customer',
          customerPhone: s.customerPhone || '—',
          cashierName: s.cashier.name,
          amount,
          costAmount: Number(totalCost.toFixed(2)),
          netProfit: Number((amount - totalCost).toFixed(2)),
          paymentMethod: s.paymentMethod,
          status: 'COMPLETED',
          itemCount: s.items.reduce((acc: number, it: any) => acc + it.quantity, 0),
          createdAt: s.createdAt,
          items: s.items.map((it: any) => ({
            name: it.product.name,
            variantName: it.variant?.name,
            quantity: it.quantity,
            price: Number(it.unitPrice),
            subtotal: Number(it.subtotal),
          })),
        };
      });

      // Combine & sort
      let allSales = [...mappedOnline, ...mappedOffline].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Channel Filter
      if (channel === 'ONLINE') {
        allSales = allSales.filter((s) => s.channel === 'ONLINE');
      } else if (channel === 'OFFLINE') {
        allSales = allSales.filter((s) => s.channel === 'OFFLINE');
      }

      // Search Filter
      if (search) {
        allSales = allSales.filter(
          (s) =>
            s.referenceNumber.toLowerCase().includes(search) ||
            s.customerName.toLowerCase().includes(search) ||
            s.paymentMethod.toLowerCase().includes(search)
        );
      }

      const totalOnlineRevenue = mappedOnline.reduce((acc: number, s: any) => acc + s.amount, 0);
      const totalOfflineRevenue = mappedOffline.reduce((acc: number, s: any) => acc + s.amount, 0);
      const totalRevenue = totalOnlineRevenue + totalOfflineRevenue;
      const totalProfit = allSales.reduce((acc: number, s: any) => acc + s.netProfit, 0);

      return res.json({
        success: true,
        sales: allSales,
        summary: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalOnlineRevenue: Number(totalOnlineRevenue.toFixed(2)),
          totalOfflineRevenue: Number(totalOfflineRevenue.toFixed(2)),
          totalProfit: Number(totalProfit.toFixed(2)),
          totalOrdersCount: mappedOnline.length + mappedOffline.length,
          onlineOrdersCount: mappedOnline.length,
          offlineSalesCount: mappedOffline.length,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
