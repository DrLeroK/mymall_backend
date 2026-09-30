import { prisma } from '../config/db';
import { ConversationType, Role, AlertType } from '@prisma/client';
import { notifyConversation, notifyStore, notifyUser, notifySuperAdmin } from '../sockets/socket';

export class ChatService {
  /**
   * Find existing conversation or create a new one between participants
   */
  static async getOrCreateConversation(params: {
    type: ConversationType;
    storeId?: number;
    customerId?: number;
    adminId?: number;
    orderId?: number;
    disputeId?: number;
  }) {
    const { type, storeId, customerId, adminId, orderId, disputeId } = params;

    const whereClause: any = { type };
    if (storeId) whereClause.storeId = storeId;
    if (customerId) whereClause.customerId = customerId;
    if (adminId) whereClause.adminId = adminId;
    if (orderId) whereClause.orderId = orderId;
    if (disputeId) whereClause.disputeId = disputeId;

    let conversation = await prisma.chatConversation.findFirst({
      where: whereClause,
      include: {
        store: { select: { id: true, name: true, slug: true, logoUrl: true } },
        customer: { select: { id: true, name: true, email: true, role: true } },
        admin: { select: { id: true, name: true, email: true } },
        dispute: true,
      },
    });

    if (!conversation) {
      conversation = await prisma.chatConversation.create({
        data: {
          type,
          storeId: storeId || null,
          customerId: customerId || null,
          adminId: adminId || null,
          orderId: orderId || null,
          disputeId: disputeId || null,
        },
        include: {
          store: { select: { id: true, name: true, slug: true, logoUrl: true } },
          customer: { select: { id: true, name: true, email: true, role: true } },
          admin: { select: { id: true, name: true, email: true } },
          dispute: true,
        },
      });
    }

    return conversation;
  }

  /**
   * List conversations accessible to a given user
   */
  static async listUserConversations(userId: number, role: Role, storeId?: number | null) {
    const orConditions: any[] = [];

    if (role === Role.SUPER_ADMIN) {
      orConditions.push({ type: ConversationType.ADMIN_STORE });
      orConditions.push({ type: ConversationType.ADMIN_CUSTOMER });
      orConditions.push({ type: ConversationType.DISPUTE });
      orConditions.push({ adminId: userId });
    }

    if (storeId && (role === Role.STORE_OWNER || role === Role.STORE_STAFF)) {
      orConditions.push({ storeId });
    }

    // Every user as a customer
    orConditions.push({ customerId: userId });

    const conversations = await prisma.chatConversation.findMany({
      where: { OR: orConditions },
      include: {
        store: { select: { id: true, name: true, slug: true, logoUrl: true } },
        customer: { select: { id: true, name: true, email: true } },
        admin: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, orderNumber: true, status: true, totalAmount: true } },
        dispute: { select: { id: true, disputeNumber: true, status: true, title: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return conversations.map((conv) => {
      const lastMessage = conv.messages[0] || null;
      return {
        id: conv.id,
        type: conv.type,
        store: conv.store,
        customer: conv.customer,
        admin: conv.admin,
        order: conv.order,
        dispute: conv.dispute,
        lastMessage,
        lastMessageAt: conv.lastMessageAt,
      };
    });
  }

  /**
   * Send a chat message within a conversation
   */
  static async sendMessage(params: {
    conversationId: number;
    senderId: number;
    content: string;
    attachmentUrl?: string;
  }) {
    const { conversationId, senderId, content, attachmentUrl } = params;

    const message = await prisma.chatMessage.create({
      data: {
        conversationId,
        senderId,
        content,
        attachmentUrl: attachmentUrl || null,
        isRead: false,
      },
      include: {
        sender: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    // Update conversation timestamp
    const conversation = await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
      include: {
        store: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    });

    // 1. Specific conversation room
    notifyConversation(conversationId, 'chat:message', message);

    // 2. Notify store room if conversation belongs to a store and sender is not store staff/owner
    if (conversation.storeId) {
      const isStoreSender = (message.sender.role === Role.STORE_OWNER || message.sender.role === Role.STORE_STAFF) && message.senderId !== conversation.customerId;
      if (!isStoreSender) {
        notifyStore(conversation.storeId, 'chat:message', message);

        try {
          await prisma.alert.create({
            data: {
              storeId: conversation.storeId,
              type: AlertType.NEW_MESSAGE,
              title: `New Message from ${message.sender.name || 'Customer'}`,
              message: message.content.slice(0, 120),
            },
          });
        } catch (e) {
          console.error('Failed to create store alert for chat:', e);
        }
      }
    }

    // 3. Notify customer room if sender is not customer
    if (conversation.customerId && message.senderId !== conversation.customerId) {
      notifyUser(conversation.customerId, 'chat:message', message);
    }

    // 4. Notify superadmin if admin conversation or dispute and sender is not admin
    if (conversation.adminId || conversation.type === ConversationType.ADMIN_STORE || conversation.type === ConversationType.ADMIN_CUSTOMER || conversation.type === ConversationType.DISPUTE) {
      if (message.sender.role !== Role.SUPER_ADMIN) {
        notifySuperAdmin('chat:message', message);
        if (conversation.adminId) {
          notifyUser(conversation.adminId, 'chat:message', message);
        }
      }
    }

    return message;
  }

  /**
   * Get paginated message history for a conversation
   */
  static async getMessages(conversationId: number, limit: number = 50, offset: number = 0) {
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    });

    return messages;
  }

  /**
   * Mark all unread messages in a conversation as read by the user
   */
  static async markAsRead(conversationId: number, userId: number) {
    return await prisma.chatMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });
  }
}
