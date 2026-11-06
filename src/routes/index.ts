import { Router } from 'express';
import authRoutes from './auth.routes';
import storeRoutes from './store.routes';
import staffRoutes from './staff.routes';
import billingRoutes from './billing.routes';
import productRoutes from './product.routes';
import posRoutes from './pos.routes';
import orderRoutes from './order.routes';
import storefrontRoutes from './storefront.routes';
import analyticsRoutes from './analytics.routes';
import reviewRoutes from './review.routes';
import chatRoutes from './chat.routes';
import disputeRoutes from './dispute.routes';
import addressRoutes from './address.routes';
import alertRoutes from './alert.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/stores', storeRoutes);
router.use('/staff', staffRoutes);
router.use('/billing', billingRoutes);
router.use('/products', productRoutes);
router.use('/pos', posRoutes);
router.use('/orders', orderRoutes);
router.use('/storefront', storefrontRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/reviews', reviewRoutes);
router.use('/chat', chatRoutes);
router.use('/disputes', disputeRoutes);
router.use('/addresses', addressRoutes);
router.use('/notifications', alertRoutes);
router.use('/alerts', alertRoutes);

export default router;
