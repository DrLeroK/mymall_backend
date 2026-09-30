import { Router } from 'express';
import { StorefrontController } from '../controllers/storefront.controller';
import { optionalAuthenticate } from '../middleware/auth.middleware';

const router = Router();

// Universal Marketplace Search (Stores & Products with subscription tier ranking boost)
router.get('/search/all', StorefrontController.marketplaceSearch);

// Store Details & Branding
router.get('/:slug', StorefrontController.getStorefrontData);

// Store Bank Accounts for Manual Customer Transfers
router.get('/:slug/bank-accounts', StorefrontController.getStoreBankAccounts);

// Product Catalog Search & Filtering within a Store
router.get('/:slug/products', StorefrontController.getCatalog);

// Product Details
router.get('/:slug/products/:productId', StorefrontController.getProductDetails);

// Add Product Review & Rating
router.post('/:slug/products/:productId/reviews', optionalAuthenticate, StorefrontController.addReview);

// Store Reviews
router.get('/:slug/reviews', StorefrontController.getStoreReviews);
router.post('/:slug/reviews', optionalAuthenticate, StorefrontController.addStoreReview);

export default router;
