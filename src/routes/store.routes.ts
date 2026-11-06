import { Router } from 'express';
import { StoreController } from '../controllers/store.controller';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { uploadBranding } from '../middleware/upload.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Store Registration Onboarding Flow
router.post('/onboard', authenticate, uploadBranding, StoreController.onboardStore);

// Store Admin Settings Management
router.patch(
  '/settings',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  uploadBranding,
  StoreController.updateSettings
);

// Get current store details
router.get('/me', authenticate, tenantIsolation, StoreController.getMyStore);

// Store Bank Accounts for Manual Customer Payments
router.get('/bank-accounts', authenticate, tenantIsolation, StoreController.getBankAccounts);
router.post(
  '/bank-accounts',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StoreController.createBankAccount
);
router.patch(
  '/bank-accounts/:id',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StoreController.updateBankAccount
);
router.delete(
  '/bank-accounts/:id',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StoreController.deleteBankAccount
);

// Store Custom Chapa Payment Keys Configuration
router.patch(
  '/payment-keys',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  StoreController.updatePaymentKeys
);

// Super Admin Store Operations
router.get('/admin/all', authenticate, authorizeRoles(Role.SUPER_ADMIN), StoreController.adminListStores);
router.get('/admin/owners', authenticate, authorizeRoles(Role.SUPER_ADMIN), StoreController.adminListStoreOwners);
router.get('/admin/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN), StoreController.adminGetStore);
router.patch('/admin/:id/status', authenticate, authorizeRoles(Role.SUPER_ADMIN), StoreController.adminUpdateStoreStatus);

export default router;
