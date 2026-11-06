import { prisma } from '../config/db';

export class AnalyticsService {
  /**
   * Store Owner Analytics Dashboard
   */
  static async getStoreAnalytics(storeId: number) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new Error(`Store ${storeId} not found.`);

    // 1. Online Orders
    const onlineOrders = await prisma.order.findMany({
      where: { storeId, status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED'] } },
    });

    // 2. Physical POS Sales
    const posSales = await prisma.pOSSale.findMany({
      where: { storeId },
    });

    const onlineRevenue = onlineOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const posRevenue = posSales.reduce((sum, s) => sum + Number(s.netAmount), 0);
    const totalRevenue = onlineRevenue + posRevenue;

    // Split ratio
    const onlineCount = onlineOrders.length;
    const posCount = posSales.length;
    const totalCount = onlineCount + posCount;

    // 3. Inventory Valuation
    const products = await prisma.product.findMany({
      where: { storeId },
      select: { costPrice: true, sellingPrice: true, stockQuantity: true },
    });

    let totalInventoryCost = 0;
    let totalInventoryRetailValue = 0;

    products.forEach((p) => {
      totalInventoryCost += Number(p.costPrice) * p.stockQuantity;
      totalInventoryRetailValue += Number(p.sellingPrice) * p.stockQuantity;
    });

    // 4. Best Selling Products
    const posItems = await prisma.pOSSaleItem.findMany({
      where: { posSale: { storeId } },
      include: { product: { select: { id: true, name: true, sellingPrice: true } } },
    });

    const orderItems = await prisma.orderItem.findMany({
      where: { order: { storeId, status: { in: ['PAID', 'COMPLETED'] } } },
      include: { product: { select: { id: true, name: true, sellingPrice: true } } },
    });

    const productSalesMap: Record<number, { id: number; name: string; totalQty: number; totalRevenue: number }> = {};

    [...posItems, ...orderItems].forEach((item) => {
      if (!item.product) return;
      const pid = item.product.id;
      if (!productSalesMap[pid]) {
        productSalesMap[pid] = {
          id: pid,
          name: item.product.name,
          totalQty: 0,
          totalRevenue: 0,
        };
      }
      productSalesMap[pid].totalQty += item.quantity;
      productSalesMap[pid].totalRevenue += Number(item.subtotal);
    });

    const bestSellers = Object.values(productSalesMap)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 5);

    // 5. Low stock products
    const storeProducts = await prisma.product.findMany({
      where: { storeId, isActive: true },
      select: {
        id: true,
        name: true,
        stockQuantity: true,
        lowStockThreshold: true,
        unit: true,
      },
    });

    const lowStockItems = storeProducts.filter((p) => p.stockQuantity <= p.lowStockThreshold);
    const lowStockCount = lowStockItems.length;

    // 6. Recent orders
    const recentOrders = await prisma.order.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      storeName: store.name,
      currency: store.currency,
      totalRevenue,
      onlineSalesTotal: onlineRevenue,
      posSalesTotal: posRevenue,
      inventoryCostValuation: totalInventoryCost,
      inventoryRetailValuation: totalInventoryRetailValue,
      totalSalesCount: totalCount,
      lowStockCount,
      lowStockItems,
      recentOrders,
      salesSplit: {
        online: { count: onlineCount, revenue: onlineRevenue, percent: totalRevenue > 0 ? (onlineRevenue / totalRevenue) * 100 : 0 },
        pos: { count: posCount, revenue: posRevenue, percent: totalRevenue > 0 ? (posRevenue / totalRevenue) * 100 : 0 },
      },
      inventory: {
        totalProducts: products.length,
        totalCostValue: totalInventoryCost,
        totalRetailValue: totalInventoryRetailValue,
        potentialProfitMargin: totalInventoryRetailValue - totalInventoryCost,
        lowStockCount,
      },
      bestSellers,
    };
  }

  /**
   * Super-Admin SaaS Platform Metrics Dashboard
   */
  static async getPlatformAnalytics() {
    const totalStores = await prisma.store.count();
    const activeStores = await prisma.store.count({ where: { status: 'ACTIVE' } });
    const suspendedStores = await prisma.store.count({ where: { status: 'SUSPENDED' } });
    const pastDueStores = await prisma.store.count({ where: { status: 'PAST_DUE' } });

    // Platform GMV (Gross Merchandise Volume across online & POS)
    const onlineOrders = await prisma.order.findMany({
      where: { status: { in: ['PAID', 'COMPLETED'] } },
      select: { totalAmount: true },
    });
    const posSales = await prisma.pOSSale.findMany({
      select: { netAmount: true },
    });

    const onlineGMV = onlineOrders.reduce((acc, o) => acc + Number(o.totalAmount), 0);
    const posGMV = posSales.reduce((acc, s) => acc + Number(s.netAmount), 0);
    const platformGMV = onlineGMV + posGMV;

    // Subscription MRR (Monthly Recurring Revenue) & Approved Income
    const approvedSubscriptions = await prisma.storeSubscription.findMany({
      where: { status: 'APPROVED' },
      include: { plan: true },
    });

    let mrr = 0;
    let totalSubscriptionIncome = 0;
    let chapaSubscriptionIncome = 0;
    let bankTransferSubscriptionIncome = 0;

    const now = new Date();
    approvedSubscriptions.forEach((sub) => {
      const price = Number(sub.amount) || 0;
      totalSubscriptionIncome += price;

      if (sub.paymentMethod === 'CHAPA') {
        chapaSubscriptionIncome += price;
      } else {
        bankTransferSubscriptionIncome += price;
      }

      // MRR calculation for currently active subscriptions
      if (sub.endDate && new Date(sub.endDate) >= now) {
        if (sub.billingCycle === 'YEARLY') {
          mrr += price / 12;
        } else if (sub.billingCycle === 'SIX_MONTHS') {
          mrr += price / 6;
        } else if (sub.billingCycle === 'THREE_MONTHS') {
          mrr += price / 3;
        } else {
          mrr += price;
        }
      }
    });

    const arr = mrr * 12;
    const churnRatePercent = totalStores > 0 ? (suspendedStores / totalStores) * 100 : 0;

    // Pending Subscription Verifications Queue
    const pendingVerificationsCount = await prisma.storeSubscription.count({
      where: { status: 'PENDING_APPROVAL' },
    });

    return {
      totalStores,
      activeStores,
      suspendedStores,
      pastDueStores,
      platformGMV,
      totalSubscriptionIncome: Math.round(totalSubscriptionIncome * 100) / 100,
      chapaSubscriptionIncome: Math.round(chapaSubscriptionIncome * 100) / 100,
      bankTransferSubscriptionIncome: Math.round(bankTransferSubscriptionIncome * 100) / 100,
      approvedSubscriptionsCount: approvedSubscriptions.length,
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      churnRatePercent: Math.round(churnRatePercent * 10) / 10,
      pendingVerificationsCount,
    };
  }
}
