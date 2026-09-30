import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { ChatService } from '../services/chatService';
import { ConversationType, Role } from '@prisma/client';

function getEffectiveStoreId(req: Request): number | undefined {
  if (req.storeId) return req.storeId;
  if (req.user?.storeId) return req.user.storeId;
  const header = req.headers['x-store-id'];
  if (header && !isNaN(parseInt(header as string, 10))) {
    return parseInt(header as string, 10);
  }
  return undefined;
}

export class ChatController {
  /**
   * List all conversations for the authenticated user
   */
  static async listConversations(req: Request, res: Response) {
    try {
      const user = req.user!;
      const storeId = getEffectiveStoreId(req) || null;

      const conversations = await ChatService.listUserConversations(user.id, user.role, storeId);
      return res.json({ success: true, count: conversations.length, conversations });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Start or retrieve existing conversation
   * Types:
   * - ADMIN_STORE: Platform admin & Store Owner
   * - STORE_CUSTOMER: Store Owner & Customer (e.g. regarding an order or product)
   * - ADMIN_CUSTOMER: Platform Admin & Customer
   */
  static async startConversation(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { type, storeId, customerId, orderId, disputeId } = req.body;

      if (!type || !Object.values(ConversationType).includes(type)) {
        return res.status(400).json({ success: false, message: 'Valid conversation type is required.' });
      }

      let targetStoreId = storeId ? parseInt(storeId, 10) : getEffectiveStoreId(req);
      let targetCustomerId = customerId ? parseInt(customerId, 10) : undefined;
      let targetAdminId: number | undefined = undefined;

      if (type === ConversationType.ADMIN_STORE) {
        if (!targetStoreId) {
          return res.status(400).json({ success: false, message: 'storeId is required for ADMIN_STORE conversation.' });
        }
        if (user.role === Role.SUPER_ADMIN) {
          targetAdminId = user.id;
        }
      } else if (type === ConversationType.STORE_CUSTOMER) {
        if (!targetStoreId) {
          return res.status(400).json({ success: false, message: 'storeId is required for STORE_CUSTOMER conversation.' });
        }
        targetCustomerId = customerId ? parseInt(customerId, 10) : user.id;
      } else if (type === ConversationType.ADMIN_CUSTOMER) {
        if (user.role === Role.SUPER_ADMIN) {
          targetAdminId = user.id;
          if (customerId) targetCustomerId = parseInt(customerId, 10);
        } else {
          targetCustomerId = user.id;
        }
      }

      const conversation = await ChatService.getOrCreateConversation({
        type: type as ConversationType,
        storeId: targetStoreId,
        customerId: targetCustomerId,
        adminId: targetAdminId,
        orderId: orderId ? parseInt(orderId, 10) : undefined,
        disputeId: disputeId ? parseInt(disputeId, 10) : undefined,
      });

      return res.status(200).json({ success: true, conversation });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get message history for a conversation
   */
  static async getMessages(req: Request, res: Response) {
    try {
      const user = req.user!;
      const conversationId = parseInt(req.params.id, 10);

      const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found.' });
      }

      // Access Control Check
      const userStoreId = getEffectiveStoreId(req);
      const isSuperAdmin = user.role === Role.SUPER_ADMIN;
      const isStoreMember = Boolean(userStoreId && conversation.storeId === userStoreId);
      const isCustomerParticipant = conversation.customerId === user.id;
      const isAdminParticipant = conversation.adminId === user.id;

      if (!isSuperAdmin && !isStoreMember && !isCustomerParticipant && !isAdminParticipant) {
        return res.status(403).json({ success: false, message: 'Unauthorized access to this conversation.' });
      }

      const messages = await ChatService.getMessages(conversationId);

      // Mark messages as read asynchronously
      await ChatService.markAsRead(conversationId, user.id);

      return res.json({ success: true, conversationId, count: messages.length, messages });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Send a message in a conversation
   */
  static async sendMessage(req: Request, res: Response) {
    try {
      const user = req.user!;
      const conversationId = parseInt(req.params.id, 10);
      const { content, attachmentUrl } = req.body;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Message content is required.' });
      }

      const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found.' });
      }

      // Access Control Check
      const userStoreId = getEffectiveStoreId(req);
      const isSuperAdmin = user.role === Role.SUPER_ADMIN;
      const isStoreMember = Boolean(userStoreId && conversation.storeId === userStoreId);
      const isCustomerParticipant = conversation.customerId === user.id;
      const isAdminParticipant = conversation.adminId === user.id;

      if (!isSuperAdmin && !isStoreMember && !isCustomerParticipant && !isAdminParticipant) {
        return res.status(403).json({ success: false, message: 'Unauthorized to post messages in this conversation.' });
      }

      const message = await ChatService.sendMessage({
        conversationId,
        senderId: user.id,
        content: content.trim(),
        attachmentUrl,
      });

      return res.status(201).json({ success: true, message });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
