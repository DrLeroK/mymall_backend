import { prisma } from '../config/db';
import { StoreStatus, AlertType, BillingCycle } from '@prisma/client';
import { notifyStore, notifySuperAdmin } from '../sockets/socket';

export class BillingService {
  /**
   * Check if a store has reached its product limit under its current plan.
   */
  static async canAddProduct(storeId: number): Promise<{ allowed: boolean; currentCount: number; maxProducts: number; reason?: string }> {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        plan: true,
        subscriptions: {
          where: { status: 'APPROVED', endDate: { gte: new Date() } },
          orderBy: { endDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!store) {
      return { allowed: false, currentCount: 0, maxProducts: 0, reason: 'Store not found.' };
    }

    // Allow if under trial or has active subscription
    const now = new Date();
    const isUnderTrial = (store.isTrial && store.trialEndsAt && now <= store.trialEndsAt) || (store.subscriptionEndsAt && now <= store.subscriptionEndsAt);
    const hasActiveSubscription = (store.subscriptions && store.subscriptions.length > 0) || isUnderTrial;

    if (!hasActiveSubscription) {
      return {
        allowed: false,
        currentCount: 0,
        maxProducts: 0,
        reason: 'Active subscription required. Please subscribe to a plan to add products.',
      };
    }

    const currentCount = await prisma.product.count({ where: { storeId } });
    const maxProducts = store?.plan?.maxProducts || 25;

    return {
      allowed: currentCount < maxProducts,
      currentCount,
      maxProducts,
    };
  }

  /**
   * Check if a store can invite more staff under its plan limits.
   */
  static async canAddStaff(storeId: number): Promise<{ allowed: boolean; currentCount: number; maxStaff: number }> {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { plan: true },
    });

    const currentCount = await prisma.storeStaffMember.count({ where: { storeId, isActive: true } });
    const maxStaff = store?.plan?.maxStaff || 2;

    return {
      allowed: currentCount < maxStaff,
      currentCount,
      maxStaff,
    };
  }

  /**
   * Helper: Calculate price based on selected billing cycle
   */
  static getCyclePrice(plan: any, cycle: BillingCycle): number {
    switch (cycle) {
      case BillingCycle.THREE_MONTHS:
        return Number(plan.threeMonthsPrice) || Number(plan.monthlyPrice) * 3;
      case BillingCycle.SIX_MONTHS:
        return Number(plan.sixMonthsPrice) || Number(plan.monthlyPrice) * 6;
      case BillingCycle.YEARLY:
        return Number(plan.yearlyPrice) || Number(plan.monthlyPrice) * 12;
      case BillingCycle.MONTHLY:
      default:
        return Number(plan.monthlyPrice);
    }
  }

  /**
   * Helper: Calculate cycle duration in days
   */
  static getCycleDays(cycle: BillingCycle): number {
    switch (cycle) {
      case BillingCycle.THREE_MONTHS:
        return 90;
      case BillingCycle.SIX_MONTHS:
        return 180;
      case BillingCycle.YEARLY:
        return 365;
      case BillingCycle.MONTHLY:
      default:
        return 30;
    }
  }

  /**
   * Helper: Calculate upgrade information and resulting expiry date
   */
  static calculateUpgradeDetails(currentStore: any, newPlanId: number, cycle: BillingCycle) {
    const daysGranted = this.getCycleDays(cycle);
    const now = new Date();
    const isUpgrade = Boolean(currentStore.currentPlanId && currentStore.currentPlanId !== newPlanId);
    const previousPlanId = currentStore.currentPlanId || null;

    let baseDate = now;
    // If store currently has an active non-trial subscription that hasn't expired, carry over remaining days
    if (currentStore.subscriptionEndsAt && new Date(currentStore.subscriptionEndsAt) > now && !currentStore.isTrial) {
      baseDate = new Date(currentStore.subscriptionEndsAt);
    }

    const newEndDate = new Date(baseDate);
    newEndDate.setDate(newEndDate.getDate() + daysGranted);

    return {
      isUpgrade,
      previousPlanId,
      daysGranted,
      newEndDate,
    };
  }

  /**
   * Automated Cron Job function: Check all stores for expired subscriptions.
   * Handles grace period (3 days) -> PAST_DUE -> SUSPENDED (soft-lock / hard takedown).
   */
  static async checkSubscriptionExpirations(): Promise<{ updatedStores: number }> {
    const now = new Date();
    const GRACE_PERIOD_DAYS = 3;

    const stores = await prisma.store.findMany({
      where: {
        status: { in: [StoreStatus.ACTIVE, StoreStatus.PAST_DUE] },
        subscriptionEndsAt: { not: null, lt: now },
      },
    });

    let updatedCount = 0;

    for (const store of stores) {
      if (!store.subscriptionEndsAt) continue;

      const gracePeriodEnd = new Date(store.subscriptionEndsAt);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

      if (now > gracePeriodEnd && store.status !== StoreStatus.SUSPENDED) {
        // Soft-lock / Hard takedown suspension
        await prisma.store.update({
          where: { id: store.id },
          data: { status: StoreStatus.SUSPENDED },
        });

        await prisma.alert.create({
          data: {
            storeId: store.id,
            type: AlertType.SUBSCRIPTION_SUSPENDED,
            title: 'Store Subscription Suspended',
            message: 'Your store subscription has expired past the grace period. Storefront access has been suspended.',
          },
        });

        notifyStore(store.id, 'subscription:status_changed', {
          status: StoreStatus.SUSPENDED,
          message: 'Store subscription suspended.',
        });

        notifySuperAdmin('platform:store_suspended', {
          storeId: store.id,
          storeName: store.name,
        });

        updatedCount++;
      } else if (now > store.subscriptionEndsAt && store.status === StoreStatus.ACTIVE) {
        // Grace period status: PAST_DUE
        await prisma.store.update({
          where: { id: store.id },
          data: { status: StoreStatus.PAST_DUE },
        });

        await prisma.alert.create({
          data: {
            storeId: store.id,
            type: AlertType.SUBSCRIPTION_EXPIRING,
            title: 'Subscription Past Due',
            message: `Your subscription expired on ${store.subscriptionEndsAt.toISOString().split('T')[0]}. Please submit payment proof within 3 days to avoid suspension.`,
          },
        });

        notifyStore(store.id, 'subscription:status_changed', {
          status: StoreStatus.PAST_DUE,
          message: 'Subscription past due.',
        });

        updatedCount++;
      }
    }

    return { updatedStores: updatedCount };
  }
}
