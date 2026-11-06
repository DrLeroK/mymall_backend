import { Router } from 'express';
import { AlertController } from '../controllers/alert.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/unseen', AlertController.getUnseenPopups);
router.get('/', AlertController.getNotifications);
router.patch('/read-all', AlertController.markAllAsRead);
router.patch('/seen-all', AlertController.markAllAsSeen);
router.patch('/:id/read', AlertController.markAsRead);

export default router;
