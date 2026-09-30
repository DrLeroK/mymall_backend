import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { DisputeStatus, DisputeType, Role, ConversationType, AlertType } from '@prisma/client';
import { notifyStore, notifySuperAdmin } from '../sockets/socket';

function getEffectiveStoreId(req: Request): number | undefined {
  if (req.storeId) return req.storeId;
  if (req.user?.storeId) return req.user.storeId;
  const header = req.headers['x-store-id'];
  if (header && !isNaN(parseInt(header as string, 10))) {
    return parseInt(header as string, 10);
  }
  return undefined;
}

export class DisputeController {
  /**
   * File a Report or Dispute (Customer or Store Owner)
   */
  static async fileDispute(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { title, description, type = DisputeType.ORDER_ISSUE, storeId, orderId } = req.body;

      if (!title || !description) {
        return res.status(400).json({ success: false, message: 'Dispute title and description are required.' });
      }

      const disputeNumber = `DSP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

      const dispute = await prisma.$transaction(async (tx) => {
        const createdDispute = await tx.dispute.create({
          data: {
            disputeNumber,
            type: type as DisputeType,
            status: DisputeStatus.OPEN,
            title,
            description,
            reporterId: user.id,
            storeId: storeId ? parseInt(storeId, 10) : null,
            orderId: orderId ? parseInt(orderId, 10) : null,
          },
          include: {
            reporter: { select: { id: true, name: true, email: true } },
            store: { select: { id: true, name: true, slug: true } },
            order: { select: { id: true, orderNumber: true, totalAmount: true } },
          },
        });

        // Automatically create a linked dispute chat conversation
        await tx.chatConversation.create({
          data: {
            type: ConversationType.DISPUTE,
            disputeId: createdDispute.id,
            customerId: user.id,
            storeId: storeId ? parseInt(storeId, 10) : null,
            orderId: orderId ? parseInt(orderId, 10) : null,
          },
        });

        // Trigger alert for Store if store involved
        if (storeId) {
          await tx.alert.create({
            data: {
              storeId: parseInt(storeId, 10),
              type: AlertType.DISPUTE_FILED,
              title: `New Dispute Filed: #${disputeNumber}`,
              message: `Customer ${user.name} filed a dispute regarding: ${title}`,
            },
          });
        }

        return createdDispute;
      });

      // Real-time notifications
      if (storeId) {
        notifyStore(parseInt(storeId, 10), 'dispute:filed', { dispute });
      }
      notifySuperAdmin('dispute:new', { dispute });

      return res.status(201).json({
        success: true,
        message: 'Report/Dispute submitted successfully. Platform administrators will investigate.',
        dispute,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * List Disputes (Scoped by role: Admin sees all, Store Owner sees theirs, Customer sees theirs)
   */
  static async listDisputes(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { status } = req.query;

      const whereClause: any = {};
      if (status) whereClause.status = status as DisputeStatus;

      if (user.role === Role.SUPER_ADMIN) {
        // Admin sees all
      } else if (user.role === Role.STORE_OWNER || user.role === Role.STORE_STAFF) {
        const storeId = getEffectiveStoreId(req);
        if (!storeId) return res.status(403).json({ success: false, message: 'Store context required.' });
        whereClause.storeId = storeId;
      } else {
        // Customer sees their own filed disputes
        whereClause.reporterId = user.id;
      }

      const disputes = await prisma.dispute.findMany({
        where: whereClause,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          store: { select: { id: true, name: true, slug: true } },
          order: { select: { id: true, orderNumber: true, totalAmount: true } },
          resolvedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, count: disputes.length, disputes });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get single Dispute details + linked conversation
   */
  static async getDispute(req: Request, res: Response) {
    try {
      const user = req.user!;
      const id = parseInt(req.params.id, 10);

      const dispute = await prisma.dispute.findUnique({
        where: { id },
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          store: { select: { id: true, name: true, slug: true } },
          order: { select: { id: true, orderNumber: true, totalAmount: true, status: true } },
          resolvedBy: { select: { id: true, name: true } },
          conversation: {
            include: {
              messages: {
                include: { sender: { select: { id: true, name: true, role: true } } },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      });

      if (!dispute) {
        return res.status(404).json({ success: false, message: 'Dispute not found.' });
      }

      // Check permission
      const userStoreId = getEffectiveStoreId(req);
      const isSuperAdmin = user.role === Role.SUPER_ADMIN;
      const isStoreOwner = Boolean(userStoreId && dispute.storeId === userStoreId);
      const isReporter = dispute.reporterId === user.id;

      if (!isSuperAdmin && !isStoreOwner && !isReporter) {
        return res.status(403).json({ success: false, message: 'Unauthorized access to this dispute.' });
      }

      return res.json({ success: true, dispute });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Resolve or Update Dispute Status (Platform Admin)
   */
  static async resolveDispute(req: Request, res: Response) {
    try {
      const user = req.user!;
      const id = parseInt(req.params.id, 10);
      const { status, resolutionNotes } = req.body; // status: 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'

      if (!status || !Object.values(DisputeStatus).includes(status)) {
        return res.status(400).json({ success: false, message: 'Valid dispute status required.' });
      }

      const dispute = await prisma.dispute.findUnique({ where: { id } });
      if (!dispute) {
        return res.status(404).json({ success: false, message: 'Dispute not found.' });
      }

      const updatedDispute = await prisma.dispute.update({
        where: { id },
        data: {
          status: status as DisputeStatus,
          resolutionNotes: resolutionNotes || undefined,
          resolvedById: user.id,
        },
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          store: true,
        },
      });

      if (dispute.storeId) {
        await prisma.alert.create({
          data: {
            storeId: dispute.storeId,
            type: AlertType.DISPUTE_UPDATED,
            title: `Dispute #${dispute.disputeNumber} Updated`,
            message: `Status updated to ${status}. Notes: ${resolutionNotes || 'No notes provided.'}`,
          },
        });
        notifyStore(dispute.storeId, 'dispute:status_updated', { dispute: updatedDispute });
      }

      return res.json({
        success: true,
        message: `Dispute marked as ${status}.`,
        dispute: updatedDispute,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
