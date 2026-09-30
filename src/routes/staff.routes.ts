import { Router } from 'express';
import { StaffController } from '../controllers/staff.controller';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Staff Invite creation (Store Owner only)
router.post(
  '/invite',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StaffController.createInvite
);

// Staff accept invite (Public / Registration)
router.post('/accept-invite', StaffController.acceptInvite);

// List Store Staff
router.get(
  '/',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StaffController.listStaff
);

// Change Staff Role (CASHIER, MANAGER, INVENTORY_CLERK)
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
