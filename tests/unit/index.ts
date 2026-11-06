import { runPasswordValidationUnitTests } from './password_validation.unit.test';
import { runOtpServiceUnitTests } from './otp_service.unit.test';
import { runBillingServiceUnitTests } from './billing_service.unit.test';
import { runRbacPermissionsUnitTests } from './rbac_permissions.unit.test';
import { runStoreServiceUnitTests } from './store_service.unit.test';
import { runProductServiceUnitTests } from './product_service.unit.test';
import { runNotificationServiceUnitTests } from './notification_service.unit.test';
import { runTenantGuardUnitTests } from './tenant_guard.unit.test';

async function main() {
  console.log('=============================================================');
  console.log('🧪 RUNNING COMPREHENSIVE UNIT TEST SUITES: MyMall Backend');
  console.log('=============================================================');

  let totalPassed = 0;
  let totalFailed = 0;

  const suites = [
    { name: 'Password Validation', fn: runPasswordValidationUnitTests },
    { name: 'OTP Service', fn: runOtpServiceUnitTests },
    { name: 'Billing & Subscriptions', fn: runBillingServiceUnitTests },
    { name: 'RBAC & Permissions', fn: runRbacPermissionsUnitTests },
    { name: 'Store Service Logic', fn: runStoreServiceUnitTests },
    { name: 'Product Service Logic', fn: runProductServiceUnitTests },
    { name: 'Notification Service', fn: runNotificationServiceUnitTests },
    { name: 'Tenant Guard & RLS', fn: runTenantGuardUnitTests },
  ];

  for (const suite of suites) {
    const res = await suite.fn();
    totalPassed += res.passed;
    totalFailed += res.failed;
  }

  console.log('\n=============================================================');
  console.log(`📊 ALL UNIT TEST SUITES COMPLETE: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log('=============================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unit tests encountered unhandled error:', err);
  process.exit(1);
});
