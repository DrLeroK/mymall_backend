import { prisma } from '../../src/config/db';
import { TenantGuardService } from '../../src/services/tenantGuardService';
import { StoreService } from '../../src/services/storeService';
import { AuthService } from '../../src/services/authService';
import { Role, StaffRole } from '@prisma/client';

export async function runTenantIsolationIntegrationTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [INTEGRATION TEST] Multi-Tenant Isolation & RLS Guards Module ---');
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
  const ownerAEmail = `owner_a_${timestamp}@mymall.et`;
  const ownerBEmail = `owner_b_${timestamp}@mymall.et`;
  const cashierEmail = `cashier_${timestamp}@mymall.et`;

  let userA: any = null;
  let userB: any = null;
  let cashier: any = null;
  let storeA: any = null;
  let storeB: any = null;

  try {
    // 1. Setup User A with Store A, User B with Store B
    await AuthService.register({ email: ownerAEmail, password: 'P@ssw0rd2026!', name: 'Owner A' });
    userA = await prisma.user.update({
      where: { email: ownerAEmail },
      data: { isEmailVerified: true, role: Role.STORE_OWNER },
    });
    storeA = await StoreService.createStore(userA.id, { name: 'Addis Store A', slug: `addis-store-a-${timestamp}` });

    await AuthService.register({ email: ownerBEmail, password: 'P@ssw0rd2026!', name: 'Owner B' });
    userB = await prisma.user.update({
      where: { email: ownerBEmail },
      data: { isEmailVerified: true, role: Role.STORE_OWNER },
    });
    storeB = await StoreService.createStore(userB.id, { name: 'Hawassa Store B', slug: `hawassa-store-b-${timestamp}` });

    // 2. Setup Cashier belonging to Store A only
    await AuthService.register({ email: cashierEmail, password: 'P@ssw0rd2026!', name: 'Store A Cashier' });
    cashier = await prisma.user.update({
      where: { email: cashierEmail },
      data: { isEmailVerified: true, role: Role.STORE_STAFF },
    });
    await prisma.storeStaffMember.create({
      data: {
        storeId: storeA.id,
        userId: cashier.id,
        staffRole: StaffRole.CASHIER,
        permissions: JSON.stringify(['process_pos']),
      },
    });

    // 3. User A accessing Store A -> Granted
    const ctxA = await TenantGuardService.assertTenantAccess(userA.id, Role.STORE_OWNER, storeA.id);
    assert(ctxA.isOwner === true && ctxA.storeId === storeA.id, 'Store Owner A granted access to Store A');

    // 4. Cross-Tenant Attack: User A attempting to access Store B -> Throws 403 Forbidden
    let crossTenantBlocked = false;
    try {
      await TenantGuardService.assertTenantAccess(userA.id, Role.STORE_OWNER, storeB.id);
    } catch (e: any) {
      if (e.statusCode === 403 || (e.message && e.message.includes('Cross-Tenant Access Forbidden'))) {
        crossTenantBlocked = true;
      }
    }
    assert(crossTenantBlocked === true, 'Cross-Tenant Guard: User A blocked with 403 when accessing Store B');

    // 5. Cashier accessing Store A -> Granted as Staff
    const cashierCtx = await TenantGuardService.assertTenantAccess(cashier.id, Role.STORE_STAFF, storeA.id);
    assert(cashierCtx.staffRole === StaffRole.CASHIER && cashierCtx.storeId === storeA.id, 'Cashier granted access to authorized Store A');

    // 6. Cashier attempting to access Store B -> Blocked with 403
    let cashierCrossBlocked = false;
    try {
      await TenantGuardService.assertTenantAccess(cashier.id, Role.STORE_STAFF, storeB.id);
    } catch (e: any) {
      cashierCrossBlocked = true;
    }
    assert(cashierCrossBlocked === true, 'Cross-Tenant Guard: Store A Cashier blocked from Store B');

    // 7. RLS Scoped Filter Assertion
    const storeAFilter = TenantGuardService.scopedFilter(storeA.id, { isActive: true });
    assert(storeAFilter.storeId === storeA.id, 'RLS filter strictly isolates queries to Store A ID');

    // Clean up
    await prisma.storeStaffMember.deleteMany({ where: { userId: cashier.id } });
    await prisma.store.deleteMany({ where: { id: { in: [storeA.id, storeB.id] } } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerAEmail, ownerBEmail, cashierEmail] } } });
  } catch (err: any) {
    console.error('  ❌ [ERROR] Tenant isolation integration test exception:', err.message);
    failed++;
  }

  return { passed, failed };
}

if (require.main === module) {
  runTenantIsolationIntegrationTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
    process.exit(0);
  });
}
