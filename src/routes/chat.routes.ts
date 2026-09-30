import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// List user's conversations
router.get('/conversations', ChatController.listConversations);

// Start or get conversation
router.post('/conversations', ChatController.startConversation);

// Get message history
router.get('/conversations/:id/messages', ChatController.getMessages);

// Send message
router.post('/conversations/:id/messages', ChatController.sendMessage);

export default router;
