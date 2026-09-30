import { prisma } from '../config/db';
import { InventoryService } from './inventoryService';
import { POSPaymentMethod } from '@prisma/client';
import { generateReceiptHTML, POSReceiptData } from '../utils/receiptGenerator';

export interface CreatePOSSaleInput {
  storeId: number;
  cashierId: number;
  customerName?: string;
  customerPhone?: string;
  discountAmount?: number;
  paymentMethod?: POSPaymentMethod;
  paymentDetails?: any;
  offlineId?: string;
  notes?: string;
  items: Array<{
    productId: number;
    variantId?: number;
    quantity: number;
    unitPrice: number;
  }>;
}

export class POSService {
  /**
   * Log a physical POS sale in-store.
   * Single source of truth: Decrements inventory atomically.
   */
  static async createPOSSale(input: CreatePOSSaleInput) {
    const {
      storeId,
      cashierId,
      customerName,
      customerPhone,
      discountAmount = 0,
      paymentMethod = POSPaymentMethod.CASH,
      paymentDetails,
      offlineId,
      notes,
      items,
    } = input;

    // Idempotency check for offline sync re-submission
    if (offlineId) {
      const existing = await prisma.pOSSale.findUnique({
        where: { offlineId },
        include: { items: { include: { product: true } }, store: true, cashier: true },
      });
      if (existing) {
        return { sale: existing, alreadyProcessed: true };
      }
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new Error(`Store ID ${storeId} not found.`);

    const receiptNumber = `POS-${storeId}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    return await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      const saleItemsData: Array<{
        productId: number;
        variantId?: number | null;
        quantity: number;
        unitPrice: number;
        subtotal: number;
      }> = [];

      for (const item of items) {
        const itemSubtotal = item.quantity * item.unitPrice;
        subtotal += itemSubtotal;

        // Atomically decrement stock
        await InventoryService.decrementStock(tx, storeId, item.productId, item.quantity, item.variantId);

        saleItemsData.push({
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: itemSubtotal,
        });
      }

      const taxRate = Number(store.taxRate) || 0;
      const taxableAmount = Math.max(0, subtotal - discountAmount);
      const taxAmount = (taxableAmount * taxRate) / 100;
      const netAmount = taxableAmount + taxAmount;

      const sale = await tx.pOSSale.create({
        data: {
          receiptNumber,
          storeId,
          cashierId,
          customerName,
          customerPhone,
          discountAmount,
          taxAmount,
          totalAmount: subtotal,
          netAmount,
          paymentMethod,
          paymentDetails: paymentDetails ? JSON.stringify(paymentDetails) : null,
          offlineId: offlineId || null,
          notes,
          items: {
            create: saleItemsData,
          },
        },
        include: {
          items: { include: { product: true, variant: true } },
          cashier: { select: { id: true, name: true, email: true } },
          store: true,
        },
      });

      return { sale, alreadyProcessed: false };
    });
  }

  /**
   * Offline-First Reconciliation: Process batch of sales queued locally during network outage.
   */
  static async reconcileOfflineSales(storeId: number, cashierId: number, batchSales: CreatePOSSaleInput[]) {
    const results = [];
    for (const saleInput of batchSales) {
      try {
        const res = await this.createPOSSale({
          ...saleInput,
          storeId,
          cashierId,
        });
        results.push({
          offlineId: saleInput.offlineId,
          status: 'SUCCESS',
          receiptNumber: res.sale.receiptNumber,
          alreadyProcessed: res.alreadyProcessed,
        });
      } catch (err: any) {
        results.push({
          offlineId: saleInput.offlineId,
          status: 'FAILED',
          error: err.message,
        });
      }
    }
    return results;
  }

  /**
   * Generate Printable Receipt HTML payload
   */
  static async getReceipt(saleId: number) {
    const sale = await prisma.pOSSale.findUnique({
      where: { id: saleId },
      include: {
        store: true,
        cashier: true,
        items: { include: { product: true } },
      },
    });

    if (!sale) throw new Error('POS Sale not found');

    const receiptData: POSReceiptData = {
      receiptNumber: sale.receiptNumber,
      storeName: sale.store.name,
      storeAddress: sale.store.address || undefined,
      storePhone: sale.store.contactPhone || undefined,
      storeCurrency: sale.store.currency,
      cashierName: sale.cashier.name,
      customerName: sale.customerName || undefined,
      date: sale.createdAt.toLocaleString(),
      items: sale.items.map((i) => ({
        name: i.product.name,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        subtotal: Number(i.subtotal),
      })),
      subtotal: Number(sale.totalAmount),
      discountAmount: Number(sale.discountAmount),
      taxAmount: Number(sale.taxAmount),
      netAmount: Number(sale.netAmount),
      paymentMethod: sale.paymentMethod,
    };

    const html = generateReceiptHTML(receiptData);

    return { receiptData, html };
  }

  /**
   * Daily Cash Drawer & Payment Reconciliation Report
   */
  static async getDailyReconciliation(storeId: number, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const sales = await prisma.pOSSale.findMany({
      where: {
        storeId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    let totalCash = 0;
    let totalMobileMoney = 0;
    let totalCard = 0;
    let totalSplit = 0;
    let totalDiscounts = 0;
    let totalNetRevenue = 0;

    sales.forEach((s) => {
      const net = Number(s.netAmount);
      totalNetRevenue += net;
      totalDiscounts += Number(s.discountAmount);

      switch (s.paymentMethod) {
        case POSPaymentMethod.CASH:
          totalCash += net;
          break;
        case POSPaymentMethod.MOBILE_MONEY:
          totalMobileMoney += net;
          break;
        case POSPaymentMethod.CARD:
          totalCard += net;
          break;
        case POSPaymentMethod.SPLIT:
          totalSplit += net;
          break;
      }
    });

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalTransactions: sales.length,
      totalNetRevenue,
      totalDiscounts,
      paymentBreakdown: {
        cash: totalCash,
        mobileMoney: totalMobileMoney,
        card: totalCard,
        split: totalSplit,
      },
    };
  }
}
