import { TenantGuardService, TenantAccessContext } from '../../src/services/tenantGuardService';
import { StaffRole } from '@prisma/client';

export async function runTenantGuardUnitTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [UNIT TEST] Tenant Guard & RLS Module ---');
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

  // 1. Scoped filter generation (Row-Level Security)
  const query = TenantGuardService.scopedFilter(15, { status: 'ACTIVE', categoryId: 3 });
  assert(query.storeId === 15, 'RLS filter injects storeId 15 into query object');
  assert(query.status === 'ACTIVE' && query.categoryId === 3, 'RLS filter preserves base query parameters');

  // 2. Ownership assertion
  let threwViolation = false;
  try {
    TenantGuardService.assertEntityBelongsToTenant(20, 15, 'Product');
  } catch (e: any) {
    threwViolation = true;
  }
  assert(threwViolation === true, 'Blocks entity access when entity storeId (20) does not match tenant context (15)');

  let allowedAccess = false;
  try {
    TenantGuardService.assertEntityBelongsToTenant(15, 15, 'Product');
    allowedAccess = true;
  } catch (e) {
    allowedAccess = false;
  }
  assert(allowedAccess === true, 'Allows entity access when entity storeId (15) matches tenant context (15)');

  // 3. Permission checks on TenantAccessContext
  const ownerContext: TenantAccessContext = {
    storeId: 10,
    storeName: 'Addis Fashion Hub',
    isOwner: true,
    permissions: ['*'],
  };
  assert(TenantGuardService.assertPermission(ownerContext, [StaffRole.MANAGER], 'any_permission') === true, 'Owner has unrestricted rights');

  const staffContext: TenantAccessContext = {
    storeId: 10,
    storeName: 'Addis Fashion Hub',
    isOwner: false,
    staffRole: StaffRole.CASHIER,
    permissions: ['manage_inventory'],
  };
  assert(TenantGuardService.assertPermission(staffContext, [StaffRole.CASHIER], 'process_pos') === true, 'Staff role check passes for CASHIER');
  assert(TenantGuardService.assertPermission(staffContext, [StaffRole.INVENTORY_CLERK], 'manage_inventory') === true, 'Custom permission override passes for manage_inventory');

  let denied = false;
  try {
    TenantGuardService.assertPermission(staffContext, [StaffRole.MANAGER], 'export_financials');
  } catch {
    denied = true;
  }
  assert(denied === true, 'Staff without role or custom permission is strictly denied');

  return { passed, failed };
}

if (require.main === module) {
  runTenantGuardUnitTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
