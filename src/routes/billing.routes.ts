import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { authenticate, optionalAuthenticate, authorizeRoles } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { uploadScreenshot } from '../middleware/upload.middleware';
import { Role } from '@prisma/client';

const router = Router();

// ==========================================
// Plans (Public view, Super Admin CRUD)
// ==========================================
router.get('/plans', BillingController.getPlans);
router.post('/plans', authenticate, authorizeRoles(Role.SUPER_ADMIN), BillingController.createPlan);
router.patch('/plans/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN), BillingController.updatePlan);
router.delete('/plans/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN), BillingController.deletePlan);

// ==========================================
// Platform Bank Accounts (Merchants view, Super Admin CRUD)
// ==========================================
router.get('/platform-bank-accounts', BillingController.getPlatformBankAccounts);
router.get('/admin/bank-accounts', authenticate, authorizeRoles(Role.SUPER_ADMIN), BillingController.adminListPlatformBankAccounts);
router.post('/admin/bank-accounts', authenticate, authorizeRoles(Role.SUPER_ADMIN), BillingController.adminCreatePlatformBankAccount);
router.patch('/admin/bank-accounts/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN), BillingController.adminUpdatePlatformBankAccount);
router.delete('/admin/bank-accounts/:id', authenticate, authorizeRoles(Role.SUPER_ADMIN), BillingController.adminDeletePlatformBankAccount);

// ==========================================
// Subscriptions: Screenshot & Chapa Methods
// ==========================================
// Screenshot Payment
router.post(
  '/subscribe',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  uploadScreenshot,
  BillingController.subscribe
);

// Chapa Payment
router.post(
  '/chapa/initialize',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  BillingController.initializeChapaSubscription
);
router.get('/chapa/verify/:txRef', optionalAuthenticate, BillingController.verifyChapaSubscription);

// ==========================================
// Store Owner Invoices & Subscription History
// ==========================================
router.get('/invoices', authenticate, tenantIsolation, BillingController.getInvoices);
router.get('/history', authenticate, tenantIsolation, BillingController.getSubscriptionHistory);
router.get('/accounting-ledger', authenticate, tenantIsolation, BillingController.getAccountingLedger);

// ==========================================
// Super Admin Subscription Review Queue
// ==========================================
router.get(
  '/admin/verifications',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN),
  BillingController.listAdminVerifications
);

router.patch(
  '/admin/verifications/:id/review',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN),
  BillingController.reviewVerification
);

export default router;
