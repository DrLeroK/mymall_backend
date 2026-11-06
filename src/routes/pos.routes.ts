import { Router } from 'express';
import { POSController } from '../controllers/pos.controller';
import { authenticate, authorizeStaffRoleOrPermission } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { StaffRole } from '@prisma/client';

const router = Router();

const requirePOSAccess = authorizeStaffRoleOrPermission(
  [StaffRole.MANAGER, StaffRole.CASHIER],
  'access_pos'
);

// Log In-Store Physical Sale
router.post('/sales', authenticate, tenantIsolation, requirePOSAccess, POSController.createSale);

// Offline Queue Batch Sync
router.post('/sync-offline', authenticate, tenantIsolation, requirePOSAccess, POSController.syncOffline);

// Printable Receipt Data & HTML
router.get('/sales/:id/receipt', authenticate, POSController.getReceipt);

// Cash Drawer & Payment Reconciliation Report
router.get('/reconciliation', authenticate, tenantIsolation, requirePOSAccess, POSController.getReconciliation);

// List Store POS Sales
router.get('/sales', authenticate, tenantIsolation, requirePOSAccess, POSController.listSales);

export default router;
