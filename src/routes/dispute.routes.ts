import { Router } from 'express';
import { DisputeController } from '../controllers/dispute.controller';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate);

// File a dispute / report
router.post('/', DisputeController.fileDispute);

// List disputes
router.get('/', DisputeController.listDisputes);

// Get single dispute details with linked conversation
router.get('/:id', DisputeController.getDispute);

// Platform Admin Resolve / Reject Dispute
router.patch('/:id/resolve', authorizeRoles(Role.SUPER_ADMIN), DisputeController.resolveDispute);

export default router;
