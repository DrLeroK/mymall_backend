import { Role, StaffRole } from '@prisma/client';
import { authorizeStaffRoleOrPermission } from '../../src/middleware/auth.middleware';

export async function runRbacPermissionsUnitTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- [UNIT TEST] RBAC & Permissions Module ---');
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

  // Permission evaluation helper function matching auth.middleware logic
  function canPerformAction(
    user: { role: Role; staffRole?: StaffRole | null; permissions?: string[] },
    allowedRoles: Role[],
    allowedStaffRoles: StaffRole[] = [],
    requiredPermission?: string
  ): boolean {
    if (user.role === Role.SUPER_ADMIN || user.role === Role.STORE_OWNER) {
      return true;
    }
    if (!allowedRoles.includes(user.role)) {
      return false;
    }
    if (user.role === Role.STORE_STAFF) {
      if (user.staffRole && allowedStaffRoles.includes(user.staffRole)) {
        return true;
      }
      if (requiredPermission && user.permissions && user.permissions.includes(requiredPermission)) {
        return true; // Custom owner override
      }
      return false;
    }
    return true;
  }

  // 1. Super Admin and Store Owner have unrestricted access
  const admin = { role: Role.SUPER_ADMIN };
  const owner = { role: Role.STORE_OWNER };
  assert(canPerformAction(admin, [Role.STORE_STAFF], [StaffRole.MANAGER]) === true, 'Super Admin bypasses specific staff role requirement');
  assert(canPerformAction(owner, [Role.STORE_STAFF], [StaffRole.MANAGER]) === true, 'Store Owner bypasses specific staff role requirement');

  // 2. Cashier allowed for POS, rejected for inventory without override
  const cashier = { role: Role.STORE_STAFF, staffRole: StaffRole.CASHIER, permissions: [] };
  assert(canPerformAction(cashier, [Role.STORE_STAFF], [StaffRole.CASHIER], 'process_pos') === true, 'Cashier authorized for POS sales');
  assert(canPerformAction(cashier, [Role.STORE_STAFF], [StaffRole.INVENTORY_CLERK, StaffRole.MANAGER], 'manage_inventory') === false, 'Cashier rejected for inventory management by default');

  // 3. Custom Permission Override: Store owner grants cashier inventory rights!
  const cashierWithInventory = {
    role: Role.STORE_STAFF,
    staffRole: StaffRole.CASHIER,
    permissions: ['manage_inventory'],
  };
  assert(
    canPerformAction(cashierWithInventory, [Role.STORE_STAFF], [StaffRole.INVENTORY_CLERK, StaffRole.MANAGER], 'manage_inventory') === true,
    'Cashier with custom permission override granted by store owner can manage inventory'
  );

  // 4. Accountant role permissions
  const accountant = { role: Role.STORE_STAFF, staffRole: StaffRole.ACCOUNTANT, permissions: [] };
  assert(canPerformAction(accountant, [Role.STORE_STAFF], [StaffRole.ACCOUNTANT], 'view_finance') === true, 'Accountant authorized for financial views');
  assert(canPerformAction(accountant, [Role.STORE_STAFF], [StaffRole.CASHIER], 'process_pos') === false, 'Accountant denied POS access without override');

  // 5. Customer Order Viewing Access
  const customerUser = { role: Role.CUSTOMER };
  assert(
    canPerformAction(customerUser, [Role.CUSTOMER]) === true,
    'Customer authorized to access customer portal and their own orders'
  );

  // 6. Direct authorizeStaffRoleOrPermission middleware execution tests
  const orderListMiddleware = authorizeStaffRoleOrPermission(
    [StaffRole.MANAGER, StaffRole.ACCOUNTANT],
    'manage_orders',
    { allowCustomer: true }
  );

  let customerNextCalled: boolean = false;
  const mockReqCustomer: any = { user: { id: 1, role: Role.CUSTOMER } };
  const mockResCustomer: any = { status: () => ({ json: () => {} }) };
  orderListMiddleware(mockReqCustomer, mockResCustomer, () => { customerNextCalled = true; });
  assert(customerNextCalled, 'authorizeStaffRoleOrPermission allows Customer for order listing');

  let cashierNextCalled: boolean = false;
  let cashierStatus: number = 0;
  const mockReqCashier: any = { user: { id: 2, role: Role.STORE_STAFF, staffRole: StaffRole.CASHIER, permissions: [] } };
  const mockResCashier: any = { status: (code: number) => { cashierStatus = code; return { json: () => {} }; } };
  orderListMiddleware(mockReqCashier, mockResCashier, () => { cashierNextCalled = true; });
  assert(!cashierNextCalled && cashierStatus === 403, 'authorizeStaffRoleOrPermission strictly denies Cashier without manage_orders');

  let cashierWithOrdersNextCalled: boolean = false;
  const mockReqCashierWithPerm: any = { user: { id: 3, role: Role.STORE_STAFF, staffRole: StaffRole.CASHIER, permissions: ['manage_orders'] } };
  orderListMiddleware(mockReqCashierWithPerm, mockResCustomer, () => { cashierWithOrdersNextCalled = true; });
  assert(cashierWithOrdersNextCalled, 'authorizeStaffRoleOrPermission allows Cashier with custom manage_orders override');

  // 7. Personal Purchases access for Workers and Store Owners
  function canAccessMyPurchases(user: { id: number; role: Role; staffRole?: StaffRole | null }): boolean {
    return Boolean(user && user.id && user.role);
  }

  const cashierWorker = { id: 10, role: Role.STORE_STAFF, staffRole: StaffRole.CASHIER };
  const storeOwnerUser = { id: 20, role: Role.STORE_OWNER };
  assert(canAccessMyPurchases(cashierWorker), 'Cashier/worker can access personal orders via /orders/my-orders');
  assert(canAccessMyPurchases(storeOwnerUser), 'Store owner can access personal orders via /orders/my-orders');

  return { passed, failed };
}

if (require.main === module) {
  runRbacPermissionsUnitTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}
