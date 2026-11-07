process.env.NODE_ENV = 'test';
import { runAuthIntegrationTests } from './auth.integration.test';
import { runStoreTenantIntegrationTests } from './store_tenant.integration.test';
import { runProductVariantsIntegrationTests } from './product_variants.integration.test';
import { runStaffMembershipIntegrationTests } from './staff_membership.integration.test';
import { runNotificationSyncboardIntegrationTests } from './notification_syncboard.integration.test';
import { runTenantIsolationIntegrationTests } from './tenant_isolation.integration.test';

import { ensureDefaultSubscriptionPlans } from '../helpers/seedPlans';

async function main() {
  console.log('=============================================================');
  console.log('🧪 RUNNING COMPREHENSIVE INTEGRATION TEST SUITES: MyMall Backend');
  console.log('=============================================================');

  await ensureDefaultSubscriptionPlans();

  let totalPassed = 0;
  let totalFailed = 0;

  const suites = [
    { name: 'Auth & Email Verification Integration', fn: runAuthIntegrationTests },
    { name: 'Store Tenant & Branding Integration', fn: runStoreTenantIntegrationTests },
    { name: 'Product Variants & Plan Limits Integration', fn: runProductVariantsIntegrationTests },
    { name: 'Staff Membership & Multi-Store Integration', fn: runStaffMembershipIntegrationTests },
    { name: 'Notification Syncboard Integration', fn: runNotificationSyncboardIntegrationTests },
    { name: 'Multi-Tenant Isolation & RLS Guards Integration', fn: runTenantIsolationIntegrationTests },
  ];

  for (const suite of suites) {
    const res = await suite.fn();
    totalPassed += res.passed;
    totalFailed += res.failed;
  }

  console.log('\n=============================================================');
  console.log(`📊 ALL INTEGRATION TEST SUITES COMPLETE: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log('=============================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Integration tests encountered unhandled error:', err);
  process.exit(1);
});
