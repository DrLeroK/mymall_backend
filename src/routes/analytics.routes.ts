import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenant.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Store Owner Analytics Dashboard
router.get(
  '/store',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN, Role.STORE_OWNER, Role.STORE_STAFF),
  tenantIsolation,
  AnalyticsController.getStoreAnalytics
);

// Super-Admin Platform SaaS Analytics
router.get(
  '/platform',
  authenticate,
  authorizeRoles(Role.SUPER_ADMIN),
  AnalyticsController.getPlatformAnalytics
);

export default router;
