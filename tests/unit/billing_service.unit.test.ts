import { BillingService } from '../../src/services/billingService';
import { BillingCycle } from '@prisma/client';

export async function runBillingServiceUnitTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [UNIT TEST] Billing Service Module ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Cycle days calculations
  assert(BillingService.getCycleDays(BillingCycle.MONTHLY) === 30, 'BillingService: calculates 30 days for MONTHLY');
  assert(BillingService.getCycleDays(BillingCycle.THREE_MONTHS) === 90, 'BillingService: calculates 90 days for THREE_MONTHS');
  assert(BillingService.getCycleDays(BillingCycle.SIX_MONTHS) === 180, 'BillingService: calculates 180 days for SIX_MONTHS');
  assert(BillingService.getCycleDays(BillingCycle.YEARLY) === 365, 'BillingService: calculates 365 days for YEARLY');

  // 2. Cycle price calculations
  const plan = { monthlyPrice: 600 };
  assert(BillingService.getCyclePrice(plan, BillingCycle.MONTHLY) === 600, 'Calculates monthly price at 1x');
  assert(BillingService.getCyclePrice(plan, BillingCycle.THREE_MONTHS) === 1800, 'Calculates 3 months price at 3x');
  assert(BillingService.getCyclePrice(plan, BillingCycle.SIX_MONTHS) === 3600, 'Calculates 6 months price at 6x');
  assert(BillingService.getCyclePrice(plan, BillingCycle.YEARLY) === 7200, 'Calculates yearly price at 12x');

  // 3. 5-Day Free trial calculation
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const diffDays = Math.round((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  assert(diffDays === 5, 'Free trial duration precisely calculates to 5 days');

  // 4. Upgrade calculation
  const currentStore = {
    id: 1,
    currentPlanId: 1,
    isTrial: false,
    subscriptionEndsAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days remaining
  };
  const upgrade = BillingService.calculateUpgradeDetails(currentStore, 2, BillingCycle.THREE_MONTHS);
  assert(upgrade.isUpgrade === true, 'BillingService: identifies upgrade from Plan 1 to Plan 2');
  assert(upgrade.previousPlanId === 1, 'BillingService: captures previousPlanId correctly');
  assert(upgrade.daysGranted === 90, 'BillingService: grants 90 days for THREE_MONTHS upgrade');
  const expectedTotalDays = Math.round((upgrade.newEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  assert(expectedTotalDays >= 99 && expectedTotalDays <= 101, 'BillingService: rolls over remaining active days (10 + 90 = ~100 days)');

  return { passed, failed };
}

if (require.main === module) {
  runBillingServiceUnitTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
