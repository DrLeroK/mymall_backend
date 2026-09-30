import { Router } from 'express';
import { ReviewController } from '../controllers/review.controller';
import { authenticate, authorizeRoles, optionalAuthenticate } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { Role } from '@prisma/client';

const router = Router();

// ==========================================
// 1. Site Reviews
// ==========================================
router.get('/site', ReviewController.getSiteReviews);
router.post('/site', optionalAuthenticate, ReviewController.createSiteReview);
router.patch('/site/:id/moderate', authenticate, authorizeRoles(Role.SUPER_ADMIN), ReviewController.moderateSiteReview);

// ==========================================
// 2. Store Reviews
// ==========================================
router.get('/stores/:storeId', ReviewController.getStoreReviews);
router.post('/stores/:storeId', optionalAuthenticate, ReviewController.createStoreReview);
router.patch(
  '/stores/:id/moderate',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER),
  tenantIsolation,
  ReviewController.moderateStoreReview
);

// ==========================================
// 3. Product Reviews
// ==========================================
router.get('/products/:productId', ReviewController.getProductReviews);
router.post('/products/:productId', optionalAuthenticate, ReviewController.createProductReview);

export default router;
