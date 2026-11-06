import { Request, Response } from "express";
import { NotificationService } from "../services/notificationService";

export class AlertController {
  /**
   * Fetch unseen popups for login / modal alert.
   * Atomically marks them isSeen: true so they never show again on subsequent logins.
   */
  static async getUnseenPopups(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const popups = await NotificationService.getUnseenPopups(user);
      return res.json({ success: true, count: popups.length, popups, alerts: popups });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get notification history for topbar notification bell dropdown
   */
  static async getNotifications(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
      const unreadOnly = req.query.unreadOnly === 'true' || req.query.unread === 'true';

      const result = await NotificationService.getAlerts(user, page, limit, unreadOnly);
      return res.json({ success: true, ...result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark single alert as read
   */
  static async markAsRead(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const alertId = parseInt(req.params.id, 10);
      if (isNaN(alertId)) {
        return res.status(400).json({ success: false, message: "Invalid alert ID" });
      }

      await NotificationService.markAsRead(alertId, user);
      return res.json({ success: true, message: "Alert marked as read" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark all alerts as read
   */
  static async markAllAsRead(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const result = await NotificationService.markAllAsRead(user);
      return res.json({ success: true, message: "All alerts marked as read", ...result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark all alerts as seen (prevents popups from reappearing)
   */
  static async markAllAsSeen(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const result = await NotificationService.markAllAsSeen(user);
      return res.json({ success: true, message: "All alerts marked as seen", ...result });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
