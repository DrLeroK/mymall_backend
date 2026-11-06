import { Router } from 'express';
import { StaffController } from '../controllers/staff.controller';
import { authenticate, optionalAuthenticate, authorizeRoles, authorizeStaffRoleOrPermission } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { Role, StaffRole } from '@prisma/client';

const router = Router();

// Staff Invite creation (Store Owner only)
router.post(
  '/invite',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StaffController.createInvite
);

// Get invite details by code
router.get('/invite/:code', StaffController.getInviteDetails);

// Staff accept invite (Authenticated user or new registration matching invited email)
router.post('/accept-invite', optionalAuthenticate, StaffController.acceptInvite);

// Switch active working store context for multi-store staff
router.post('/switch-store', authenticate, StaffController.switchStore);

// List Store Staff
router.get(
  '/',
  authenticate,
  tenantIsolation,
  authorizeStaffRoleOrPermission([StaffRole.MANAGER], 'manage_staff'),
  StaffController.listStaff
);

// Update Staff Permissions & Role
router.patch(
  '/:id/permissions',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StaffController.updatePermissions
);

// Change Staff Role (CASHIER, MANAGER, INVENTORY_CLERK, ACCOUNTANT)
router.patch(
  '/:id/role',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StaffController.changeRole
);

// Deactivate or Reactivate Staff Member
router.patch(
  '/:id/toggle-status',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StaffController.toggleStaffStatus
);

// Delete / Remove Staff Member from Store
router.delete(
  '/:id',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StaffController.deleteStaff
);

export default router;
