import { prisma } from '../../src/config/db';
import { NotificationService } from '../../src/services/notificationService';
import { StoreService } from '../../src/services/storeService';
import { AuthService } from '../../src/services/authService';
import { AlertType, Role } from '@prisma/client';

export async function runNotificationSyncboardIntegrationTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [INTEGRATION TEST] Isolated Real-time Notifications & Seen Status Module ---');
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

  const timestamp = Date.now();
  const ownerEmail = `notif_owner_${timestamp}@mymall.et`;
  let owner: any = null;
  let store: any = null;

  try {
    // 1. Setup owner and store
    await AuthService.register({ email: ownerEmail, password: 'P@ssw0rd2026!', name: 'Notif Owner' });
    owner = await prisma.user.update({
      where: { email: ownerEmail },
      data: { isEmailVerified: true, role: 'STORE_OWNER' },
    });
    store = await StoreService.createStore(owner.id, { name: 'Notification Test Store', slug: `notif-test-${timestamp}` });

    // 2. Audience isolation persistence in database
    // Store Alert: targets store only
    const storeAlert = await NotificationService.createAlert({
      targetType: 'STORE',
      type: AlertType.NEW_ORDER,
      title: 'New Order Received',
      message: 'Customer placed order #ET-9901',
      storeId: store.id,
    });
    assert(storeAlert.targetType === 'STORE' && storeAlert.storeId === store.id, 'Store alert persists with targetType STORE and storeId');
    assert(storeAlert.isSeen === false, 'Alert created with isSeen = false');

    // Admin Alert: targets superadmin only
    const adminAlert = await NotificationService.createAlert({
      targetType: 'ADMIN',
      type: AlertType.SUBSCRIPTION_EXPIRING,
      title: 'Platform Commission Due',
      message: 'Store completed billing cycle',
    });
    assert(adminAlert.targetType === 'ADMIN' && adminAlert.storeId === null, 'Admin alert persists with targetType ADMIN and no storeId');

    // 3. Syncboard Popup rule: initial unseen alerts fetch marks isSeen = true atomically
    const firstFetch = await NotificationService.getUnseenPopups({
      id: owner.id,
      role: Role.STORE_OWNER,
      storeId: store.id,
    });
    assert(firstFetch.length >= 1, 'Initial login retrieves unseen alert popup modal');
    assert(firstFetch.some((a) => a.id === storeAlert.id), 'Contains the store alert');

    // 4. Subsequent login or page refresh: must return 0 unseen alerts (never duplicate popups)
    const secondFetch = await NotificationService.getUnseenPopups({
      id: owner.id,
      role: Role.STORE_OWNER,
      storeId: store.id,
    });
    const storeAlertInSecondFetch = secondFetch.find((a) => a.id === storeAlert.id);
    assert(!storeAlertInSecondFetch, 'Subsequent login returns 0 unseen popups (prevents duplicate modals)');

    // 5. Persistent Bell History still retains notification
    const allAlerts = await NotificationService.getAlerts({
      id: owner.id,
      role: Role.STORE_OWNER,
      storeId: store.id,
    });
    const existsInHistory = allAlerts.alerts.some((a: any) => a.id === storeAlert.id);
    assert(existsInHistory === true, 'Notification bell history retains alert even after popup is marked seen');

    // Clean up
    await prisma.alert.deleteMany({ where: { id: { in: [storeAlert.id, adminAlert.id] } } });
    await prisma.store.delete({ where: { id: store.id } }).catch(() => {});
    await prisma.user.delete({ where: { email: ownerEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Notification integration test exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  runNotificationSyncboardIntegrationTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
    process.exit(0);
  });
}
