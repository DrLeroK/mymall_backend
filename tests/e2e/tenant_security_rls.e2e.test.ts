import { apiRequest } from './e2e_helper';
import { prisma } from '../../src/config/db';
import { AuthService } from '../../src/services/authService';
import { StoreService } from '../../src/services/storeService';
import { Role } from '@prisma/client';

export async function runTenantSecurityRLSE2ETests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [E2E TEST] Multi-Tenant Security & Row-Level Authorization Module ---');
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
  const ownerAEmail = `e2e_ownera_${timestamp}@mymall.et`;
  const ownerBEmail = `e2e_ownerb_${timestamp}@mymall.et`;
  const password = 'P@ssw0rd2026!';
  let tokenA = '';
  let tokenB = '';
  let storeA: any = null;
  let storeB: any = null;

  try {
    // 1. Setup Store A & Owner A
    await AuthService.register({ email: ownerAEmail, password, name: 'Owner Alpha' });
    await prisma.user.update({
      where: { email: ownerAEmail },
      data: { isEmailVerified: true },
    });
    const loginA = await AuthService.login(ownerAEmail, password);
    tokenA = loginA.tokens.accessToken;
    storeA = await StoreService.createStore(loginA.user.id, {
      name: `Tenant Store Alpha ${timestamp}`,
      slug: `tenant-a-${timestamp}`,
      contactPhone: '+251911000001',
    });

    // 2. Setup Store B & Owner B
    await AuthService.register({ email: ownerBEmail, password, name: 'Owner Beta' });
    await prisma.user.update({
      where: { email: ownerBEmail },
      data: { isEmailVerified: true },
    });
    const loginB = await AuthService.login(ownerBEmail, password);
    tokenB = loginB.tokens.accessToken;
    storeB = await StoreService.createStore(loginB.user.id, {
      name: `Tenant Store Beta ${timestamp}`,
      slug: `tenant-b-${timestamp}`,
      contactPhone: '+251911000002',
    });

    // Refresh tokens so both owners have STORE_OWNER role in JWT
    const freshA = await AuthService.login(ownerAEmail, password);
    tokenA = freshA.tokens.accessToken;
    const freshB = await AuthService.login(ownerBEmail, password);
    tokenB = freshB.tokens.accessToken;

    // 3. Owner A updates their own store (Store A) -> Allowed (200)
    const updateOwnRes = await apiRequest(
      'PATCH',
      '/stores/settings',
      { primaryColor: '#2563eb' },
      {
        Authorization: `Bearer ${tokenA}`,
        'x-store-id': storeA.id.toString(),
      }
    );
    assert(updateOwnRes.status === 200, 'Tenant A successfully updates Store A settings (HTTP 200)');

    // 4. Cross-Tenant Tampering: Owner A attempts to modify Store B settings -> Blocked (403)
    const crossTenantTamper = await apiRequest(
      'PATCH',
      '/stores/settings',
      { primaryColor: '#dc2626' },
      {
        Authorization: `Bearer ${tokenA}`,
        'x-store-id': storeB.id.toString(),
      }
    );
    assert(crossTenantTamper.status === 403, 'Cross-Tenant Guard: Tenant A blocked with 403 when tampering with Store B settings');

    // 5. Cross-Tenant Header Spoofing: Owner A claims Store B via x-store-id on products route
    const headerSpoof = await apiRequest(
      'POST',
      '/products',
      {
        name: 'Spoofed Product',
        sellingPrice: 100,
      },
      {
        Authorization: `Bearer ${tokenA}`,
        'x-store-id': storeB.id.toString(),
      }
    );
    assert(headerSpoof.status === 403, 'Cross-Tenant Guard: Header spoofing of foreign storeId blocked with 403');

    // 6. Super Admin endpoint isolation: Store owners blocked from platform admin endpoints
    const adminEndpointRes = await apiRequest(
      'GET',
      '/stores/admin/all',
      undefined,
      { Authorization: `Bearer ${tokenA}` }
    );
    assert(adminEndpointRes.status === 403, 'Platform Admin Guard: Non-superadmin blocked from /admin routes with 403');

    // Clean up
    await prisma.store.delete({ where: { id: storeA.id } }).catch(() => {});
    await prisma.store.delete({ where: { id: storeB.id } }).catch(() => {});
    await prisma.user.delete({ where: { email: ownerAEmail } }).catch(() => {});
    await prisma.user.delete({ where: { email: ownerBEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Tenant Security RLS E2E exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  const { startTestServer, stopTestServer } = require('./e2e_helper');
  startTestServer().then(() => {
    return runTenantSecurityRLSE2ETests().then(async ({ failed }) => {
      await stopTestServer();
      process.exit(failed > 0 ? 1 : 0);
    });
  });
}
