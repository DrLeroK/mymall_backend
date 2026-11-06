import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authenticate, optionalAuthenticate, authorizeStaffRoleOrPermission } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { uploadScreenshot } from '../middleware/upload.middleware';
import { StaffRole } from '@prisma/client';

const router = Router();

// Customer Cart Online Checkout (Supports Delivery vs Pickup, Screenshot vs Chapa)
router.post('/checkout', optionalAuthenticate, OrderController.checkout);

// Verify Chapa Order Payment
router.get('/chapa/verify/:txRef', OrderController.verifyChapaOrder);

// Customer Upload Payment Proof Screenshot
router.post('/:id/payment-proof', uploadScreenshot, OrderController.uploadPaymentProof);

// Store Admin / Staff Verify Customer Payment Proof Screenshot (Store Owner, Super Admin, Manager, or 'manage_orders')
router.patch(
  '/:id/verify-payment',
  authenticate,
  tenantIsolation,
  authorizeStaffRoleOrPermission([StaffRole.MANAGER], 'manage_orders'),
  OrderController.verifyPayment
);

// Store Admin / Staff Update Order Pipeline Status (Store Owner, Super Admin, Manager, or 'manage_orders')
router.patch(
  '/:id/status',
  authenticate,
  tenantIsolation,
  authorizeStaffRoleOrPermission([StaffRole.MANAGER], 'manage_orders'),
  OrderController.updateOrderStatus
);

// Sales Report: Unified Online Orders and POS Sales (Store Owner, Super Admin, Manager, Accountant, or 'view_reports')
router.get(
  '/reports/sales',
  authenticate,
  tenantIsolation,
  authorizeStaffRoleOrPermission([StaffRole.MANAGER, StaffRole.ACCOUNTANT], 'view_reports'),
  OrderController.getSalesReport
);

// List Store Orders (Store Owner, Super Admin, Manager, or staff with 'manage_orders', or Customers viewing their own orders)
router.get(
  '/',
  authenticate,
  tenantIsolation,
  authorizeStaffRoleOrPermission(
    [StaffRole.MANAGER, StaffRole.ACCOUNTANT],
    'manage_orders',
    { allowCustomer: true }
  ),
  OrderController.listOrders
);

// Personal Purchases for any authenticated user (Customer, Cashier, Worker, Owner, Admin)
router.get('/my-orders', authenticate, OrderController.getMyOrders);

// Get Order Details
router.get('/:id', optionalAuthenticate, OrderController.getOrder);

export default router;
