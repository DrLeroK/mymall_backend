import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { uploadScreenshot } from '../middleware/upload.middleware';

const router = Router();

// Customer Cart Online Checkout (Supports Delivery vs Pickup, Screenshot vs Chapa)
router.post('/checkout', optionalAuthenticate, OrderController.checkout);

// Verify Chapa Order Payment
router.get('/chapa/verify/:txRef', OrderController.verifyChapaOrder);

// Customer Upload Payment Proof Screenshot
router.post('/:id/payment-proof', uploadScreenshot, OrderController.uploadPaymentProof);

// Store Admin / Staff Verify Customer Payment Proof Screenshot
router.patch('/:id/verify-payment', authenticate, tenantIsolation, OrderController.verifyPayment);

// Store Admin / Staff Update Order Pipeline Status
router.patch('/:id/status', authenticate, tenantIsolation, OrderController.updateOrderStatus);

// List Store Orders
router.get('/', authenticate, tenantIsolation, OrderController.listOrders);

// Get Order Details
router.get('/:id', optionalAuthenticate, OrderController.getOrder);

export default router;
