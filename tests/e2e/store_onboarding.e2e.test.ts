import { apiRequest } from './e2e_helper';
import { prisma } from '../../src/config/db';
import { AuthService } from '../../src/services/authService';

export async function runStoreOnboardingE2ETests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [E2E TEST] Store Onboarding & Branding Settings Module ---');
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
  const ownerEmail = `e2e_store_${timestamp}@mymall.et`;
  const password = 'P@ssw0rd2026!';
  let token = '';
  let storeId = 0;
  const storeSlug = `e2e-store-${timestamp}`;

  try {
    // Register and verify owner
    await AuthService.register({ email: ownerEmail, password, name: 'Store Owner E2E' });
    await prisma.user.update({
      where: { email: ownerEmail },
      data: { isEmailVerified: true },
    });
    const loginRes = await AuthService.login(ownerEmail, password);
    token = loginRes.tokens.accessToken;

    // 1. Onboard new store
    const onboardRes = await apiRequest(
      'POST',
      '/stores/onboard',
      {
        name: 'Merkato Leathercrafts',
        slug: storeSlug,
        tagline: 'Authentic Ethiopian Leather Goods',
        description: 'Finest hand-stitched leather bags and shoes.',
        contactPhone: '+251911334455',
        currency: 'ETB',
        taxRate: 15.0,
      },
      { Authorization: `Bearer ${token}` }
    );
    assert(onboardRes.status === 201 && onboardRes.data.success === true, 'POST /stores/onboard creates new store (HTTP 201)');
    assert(onboardRes.data.store.isTrial === true, 'Store provisioned with isTrial = true');
    assert(!!onboardRes.data.store.trialEndsAt, 'Store provisioned with trialEndsAt');
    storeId = onboardRes.data.store.id;

    // 2. Reject duplicate slug
    const duplicateRes = await apiRequest(
      'POST',
      '/stores/onboard',
      {
        name: 'Duplicate Store',
        slug: storeSlug,
      },
      { Authorization: `Bearer ${token}` }
    );
    assert(duplicateRes.status === 409, 'Rejects store creation with conflicting slug (HTTP 409)');

    // Refresh token so user has STORE_OWNER role
    const freshOwner = await AuthService.login(ownerEmail, password);
    token = freshOwner.tokens.accessToken;

    // 3. Update store branding and settings
    const settingsRes = await apiRequest(
      'PATCH',
      '/stores/settings',
      {
        primaryColor: '#10b981',
        secondaryColor: '#064e3b',
        accentColor: '#f59e0b',
        hideOutOfStock: true,
        logoUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=500',
        bannerUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200',
        businessHours: JSON.stringify({
          mon: { open: '08:30', close: '19:30', closed: false },
          sun: { open: '10:00', close: '16:00', closed: false },
        }),
      },
      {
        Authorization: `Bearer ${token}`,
        'x-store-id': storeId.toString(),
      }
    );
    assert(settingsRes.status === 200 && settingsRes.data.success === true, 'PATCH /stores/settings updates branding and toggles (HTTP 200)');
    assert(settingsRes.data.store.hideOutOfStock === true, 'Persists hideOutOfStock boolean flag');
    assert(settingsRes.data.store.primaryColor === '#10b981', 'Persists customized theme color');

    // 4. Public store retrieval via storefront router
    const publicRes = await apiRequest('GET', `/storefront/${storeSlug}`);
    assert(publicRes.status === 200 && publicRes.data.store.slug === storeSlug, 'GET /storefront/:slug retrieves public storefront (HTTP 200)');
    assert(publicRes.data.store.primaryColor === '#10b981', 'Public storefront delivers customized branding palette');

    // Clean up
    await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    await prisma.user.delete({ where: { email: ownerEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Store Onboarding E2E exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  const { startTestServer, stopTestServer } = require('./e2e_helper');
  startTestServer().then(() => {
    return runStoreOnboardingE2ETests().then(async ({ failed }) => {
      await stopTestServer();
      process.exit(failed > 0 ? 1 : 0);
    });
  });
}
