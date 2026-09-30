import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Role, AlertType } from '@prisma/client';

export class AlertController {
  /**
   * Get notifications for the current authenticated user/store
   * Only returns unread / unseen notifications
   */
  static async getNotifications(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      let alerts: any[] = [];

      if ((user.role === Role.STORE_OWNER || user.role === Role.STORE_STAFF) && user.storeId) {
        // Merchant/Store receives store orders, customer chat messages, stock alerts
        alerts = await prisma.alert.findMany({
          where: {
            storeId: user.storeId,
            isRead: false, // Only unread notifications
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        });
      } else if (user.role === Role.SUPER_ADMIN) {
        // Superadmin only receives platform disputes and billing verifications, NEVER store orders
        alerts = await prisma.alert.findMany({
          where: {
            isRead: false,
            type: {
              notIn: [AlertType.NEW_ORDER, AlertType.LOW_STOCK],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { store: { select: { id: true, name: true } } },
        });
      } else {
        // Customer notifications: recent order updates
        const recentOrders = await prisma.order.findMany({
          where: { customerId: user.id },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            updatedAt: true,
            createdAt: true,
            store: { select: { name: true } },
          },
        });

        alerts = recentOrders.map((o) => ({
          id: o.id,
          type: 'ORDER_UPDATE',
          title: `Order #${o.orderNumber}`,
          message: `Status: ${o.status} at ${o.store?.name || 'Store'}`,
          isRead: false,
          createdAt: o.updatedAt,
        }));
      }

      const unreadCount = alerts.filter((a) => !a.isRead).length;

      return res.json({
        success: true,
        alerts,
        unreadCount,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark a single alert as read
   */
  static async markAsRead(req: Request, res: Response) {
    try {
      const alertId = parseInt(req.params.id, 10);
      if (isNaN(alertId)) {
        return res.status(400).json({ success: false, message: 'Invalid alert ID' });
      }

      await prisma.alert.update({
        where: { id: alertId },
        data: { isRead: true },
      });

      return res.json({ success: true, message: 'Alert marked as read' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark all alerts as read for the store
   */
  static async markAllAsRead(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      if (user.storeId) {
        await prisma.alert.updateMany({
          where: { storeId: user.storeId, isRead: false },
          data: { isRead: true },
        });
      } else if (user.role === Role.SUPER_ADMIN) {
        await prisma.alert.updateMany({
          where: { isRead: false, type: { notIn: [AlertType.NEW_ORDER, AlertType.LOW_STOCK] } },
          data: { isRead: true },
        });
      }

      return res.json({ success: true, message: 'All alerts marked as seen' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
