import { Router } from 'express';
import { POSController } from '../controllers/pos.controller';
import { authenticate } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';

const router = Router();

// Log In-Store Physical Sale
router.post('/sales', authenticate, tenantIsolation, POSController.createSale);

// Offline Queue Batch Sync
router.post('/sync-offline', authenticate, tenantIsolation, POSController.syncOffline);

// Printable Receipt Data & HTML
router.get('/sales/:id/receipt', authenticate, POSController.getReceipt);

// Cash Drawer & Payment Reconciliation Report
router.get('/reconciliation', authenticate, tenantIsolation, POSController.getReconciliation);

// List Store POS Sales
router.get('/sales', authenticate, tenantIsolation, POSController.listSales);

export default router;
