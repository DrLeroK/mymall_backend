import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { authenticate } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { uploadProductImages } from '../middleware/upload.middleware';

const router = Router();

// Store Products CRUD
router.get('/', authenticate, tenantIsolation, ProductController.getProducts);
router.post('/', authenticate, tenantIsolation, uploadProductImages, ProductController.createProduct);
router.patch('/:id', authenticate, tenantIsolation, uploadProductImages, ProductController.updateProduct);
router.delete('/:id', authenticate, tenantIsolation, ProductController.deleteProduct);

// Categories
router.get('/categories', authenticate, tenantIsolation, ProductController.getCategories);
router.post('/categories', authenticate, tenantIsolation, ProductController.createCategory);

// CSV Bulk Import & Export
router.post('/import-csv', authenticate, tenantIsolation, ProductController.importCSV);
router.get('/export-csv', authenticate, tenantIsolation, ProductController.exportCSV);

export default router;
