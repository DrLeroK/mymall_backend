import { apiRequest } from './e2e_helper';
import { prisma } from '../../src/config/db';
import { AuthService } from '../../src/services/authService';
import { StoreService } from '../../src/services/storeService';
import { AlertType } from '@prisma/client';

export async function runNotificationsSyncboardE2ETests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [E2E TEST] Real-Time Syncboard Notifications & Seen Status Gate Module ---');
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
  const ownerEmail = `e2e_notif_${timestamp}@mymall.et`;
  const password = 'P@ssw0rd2026!';
  let token = '';
  let store: any = null;

  try {
    // 1. Setup owner & store
    await AuthService.register({ email: ownerEmail, password, name: 'Syncboard Owner' });
    await prisma.user.update({
      where: { email: ownerEmail },
      data: { isEmailVerified: true },
    });
    const loginRes = await AuthService.login(ownerEmail, password);
    token = loginRes.tokens.accessToken;

    store = await StoreService.createStore(loginRes.user.id, {
      name: `Syncboard Store ${timestamp}`,
      slug: `syncboard-${timestamp}`,
      contactPhone: '+251911889900',
    });

    const refreshed = await AuthService.login(ownerEmail, password);
    token = refreshed.tokens.accessToken;

    // 2. Seed an unseen notification for this store
    const testAlert = await prisma.alert.create({
      data: {
        targetType: 'STORE',
        storeId: store.id,
        type: AlertType.NEW_ORDER,
        title: 'New Online Order #ET-5501',
        message: 'A customer purchased items worth 1,450 ETB.',
        isSeen: false,
        isRead: false,
      },
    });

    // 3. First fetch on login: retrieves unseen popups
    const firstFetch = await apiRequest('GET', '/alerts/unseen', undefined, {
      Authorization: `Bearer ${token}`,
      'x-store-id': store.id.toString(),
    });
    assert(firstFetch.status === 200, 'GET /alerts/unseen responds HTTP 200');
    assert(firstFetch.data.popups.length >= 1, 'Initial login retrieves unseen alert popup modal');
    assert(firstFetch.data.popups.some((p: any) => p.id === testAlert.id), 'Contains the seeded new order alert');

    // 4. Second fetch (re-login or refresh): must return 0 popups because first fetch updated isSeen = true
    const secondFetch = await apiRequest('GET', '/alerts/unseen', undefined, {
      Authorization: `Bearer ${token}`,
      'x-store-id': store.id.toString(),
    });
    assert(secondFetch.status === 200, 'GET /alerts/unseen subsequent call responds HTTP 200');
    const alertInSecond = secondFetch.data.popups.find((p: any) => p.id === testAlert.id);
    assert(!alertInSecond, 'Subsequent login returns 0 unseen popups (prevents duplicate modals)');

    // 5. Persistent Bell History still retains notification
    const bellHistory = await apiRequest('GET', '/alerts', undefined, {
      Authorization: `Bearer ${token}`,
      'x-store-id': store.id.toString(),
    });
    assert(bellHistory.status === 200, 'GET /alerts delivers persistent notification bell history');
    assert(bellHistory.data.alerts.some((a: any) => a.id === testAlert.id), 'Alert persists in bell history even after popup is marked seen');

    // Clean up
    await prisma.alert.deleteMany({ where: { storeId: store.id } });
    await prisma.store.delete({ where: { id: store.id } }).catch(() => {});
    await prisma.user.delete({ where: { email: ownerEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Notifications Syncboard E2E exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  const { startTestServer, stopTestServer } = require('./e2e_helper');
  startTestServer().then(() => {
    return runNotificationsSyncboardE2ETests().then(async ({ failed }) => {
      await stopTestServer();
      process.exit(failed > 0 ? 1 : 0);
    });
  });
}
