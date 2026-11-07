process.env.NODE_ENV = 'test';
import { startTestServer, stopTestServer } from './e2e_helper';
import { runAuthGateE2ETests } from './auth_gate.e2e.test';
import { runStoreOnboardingE2ETests } from './store_onboarding.e2e.test';
import { runCatalogVariantsLimitsE2ETests } from './catalog_variants_limits.e2e.test';
import { runStaffInviteMultiStoreE2ETests } from './staff_invite_multistore.e2e.test';
import { runNotificationsSyncboardE2ETests } from './notifications_syncboard.e2e.test';
import { runTenantSecurityRLSE2ETests } from './tenant_security_rls.e2e.test';

import { ensureDefaultSubscriptionPlans } from '../helpers/seedPlans';

export async function runAllE2ETests() {
  console.log('=============================================================');
  console.log('🧪 RUNNING COMPREHENSIVE END-TO-END (E2E) TEST SUITES: MyMall Backend');
  console.log('=============================================================');

  await ensureDefaultSubscriptionPlans();
  await startTestServer();

  let totalPassed = 0;
  let totalFailed = 0;

  try {
    const suites = [
      { name: 'Auth & Verification Gate E2E', fn: runAuthGateE2ETests },
      { name: 'Store Onboarding & Settings E2E', fn: runStoreOnboardingE2ETests },
      { name: 'Catalog Variants & Plan Limits E2E', fn: runCatalogVariantsLimitsE2ETests },
      { name: 'Staff Invitations & Multi-Store E2E', fn: runStaffInviteMultiStoreE2ETests },
      { name: 'Syncboard Notifications E2E', fn: runNotificationsSyncboardE2ETests },
      { name: 'Tenant Isolation & RLS Security E2E', fn: runTenantSecurityRLSE2ETests },
    ];

    for (const suite of suites) {
      const { passed, failed } = await suite.fn();
      totalPassed += passed;
      totalFailed += failed;
    }
  } finally {
    await stopTestServer();
  }

  console.log('\n=============================================================');
  console.log(`📊 ALL E2E TEST SUITES COMPLETE: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log('=============================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAllE2ETests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal E2E suite error:', err);
      process.exit(1);
    });
}
