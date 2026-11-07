import { prisma } from '../../src/config/db';
import { StoreService } from '../../src/services/storeService';
import { AuthService } from '../../src/services/authService';

import { ensureDefaultSubscriptionPlans } from '../helpers/seedPlans';

export async function runStoreTenantIntegrationTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [INTEGRATION TEST] Store Creation & Tenant Isolation Module ---');
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

  const ownerEmail = `store_owner_${Date.now()}@mymall.et`;
  let ownerUser: any = null;
  let createdStore: any = null;

  try {
    await ensureDefaultSubscriptionPlans();
    // 1. Create verified store owner
    const reg = await AuthService.register({
      email: ownerEmail,
      password: 'P@ssw0rd2026!',
      name: 'Integration Store Owner',
    });
    ownerUser = await prisma.user.update({
      where: { email: ownerEmail },
      data: { isEmailVerified: true, role: 'STORE_OWNER' },
    });

    // 2. Store creation auto-assigns 5-day trial on Starter plan
    createdStore = await StoreService.createStore(ownerUser.id, {
      name: 'Bole Luxe Fashion',
      slug: `bole-luxe-${Date.now()}`,
      description: 'Exclusive Ethiopian designer apparel',
      contactPhone: '+251911223344',
      address: 'Bole Medhanealem, Addis Ababa',
    });

    assert(createdStore.isTrial === true, 'Store initialized with isTrial = true');
    assert(!!createdStore.trialEndsAt, 'Store initialized with trialEndsAt timestamp');

    const now = new Date();
    const trialDays = Math.ceil((new Date(createdStore.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    assert(trialDays === 5, 'Free trial period precisely set to 5 days');

    const starterPlan = createdStore.plan || (createdStore.currentPlanId ? await prisma.subscriptionPlan.findUnique({ where: { id: createdStore.currentPlanId } }) : null);
    assert(starterPlan?.name.toLowerCase().includes('starter') === true, 'Store assigned to Starter tier by default');

    // 3. Update store settings (colors, branding, hours, hideOutOfStock)
    const updated = await StoreService.updateStoreSettings(createdStore.id, ownerUser.id, ownerUser.role, {
      primaryColor: '#059669',
      secondaryColor: '#f59e0b',
      accentColor: '#3b82f6',
      hideOutOfStock: true,
      logoUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=500',
      bannerUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200',
      businessHours: JSON.stringify({
        mon: { open: '08:00', close: '20:00', closed: false },
        sun: { open: '10:00', close: '16:00', closed: false },
      }),
    });

    assert(updated.primaryColor === '#059669', 'Primary brand color updated successfully');
    assert(updated.hideOutOfStock === true, 'hideOutOfStock toggle persists correctly');
    assert(!!updated.logoUrl && !!updated.bannerUrl, 'Store logo and banner URLs saved');

    // Clean up
    await prisma.store.delete({ where: { id: createdStore.id } }).catch(() => {});
    await prisma.user.delete({ where: { email: ownerEmail } }).catch(() => {});
  } catch (err: any) {
    console.error('  ❌ [ERROR] Store integration test exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  runStoreTenantIntegrationTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
    process.exit(0);
  });
}
