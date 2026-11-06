import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { authenticate, authorizeStaffRoleOrPermission } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { uploadProductImages, uploadAnyImage } from '../middleware/upload.middleware';
import { StaffRole } from '@prisma/client';

const router = Router();

// Strict security guard: Only Store Owner, Super Admin, Manager, Inventory Clerk, OR staff with 'manage_inventory' override
const requireInventoryAccess = authorizeStaffRoleOrPermission(
  [StaffRole.MANAGER, StaffRole.INVENTORY_CLERK],
  'manage_inventory'
);

// Specific category and utility endpoints MUST be declared before /:id
router.get('/categories', authenticate, tenantIsolation, ProductController.getCategories);
router.post('/categories', authenticate, tenantIsolation, requireInventoryAccess, ProductController.createCategory);
router.patch('/categories/:id', authenticate, tenantIsolation, requireInventoryAccess, ProductController.updateCategory);
router.delete('/categories/:id', authenticate, tenantIsolation, requireInventoryAccess, ProductController.deleteCategory);
router.get('/inventory-pricing', authenticate, tenantIsolation, ProductController.getInventoryPricing);
router.post('/upload-image', authenticate, tenantIsolation, requireInventoryAccess, uploadAnyImage, ProductController.uploadImage);
router.post('/import-csv', authenticate, tenantIsolation, requireInventoryAccess, ProductController.importCSV);
router.get('/export-csv', authenticate, tenantIsolation, ProductController.exportCSV);

// Store Products CRUD
router.get('/', authenticate, tenantIsolation, ProductController.getProducts);
router.get('/:id', authenticate, tenantIsolation, ProductController.getProductById);
router.post('/', authenticate, tenantIsolation, requireInventoryAccess, uploadProductImages, ProductController.createProduct);
router.patch('/:id', authenticate, tenantIsolation, requireInventoryAccess, uploadProductImages, ProductController.updateProduct);
router.delete('/:id', authenticate, tenantIsolation, requireInventoryAccess, ProductController.deleteProduct);

export default router;
