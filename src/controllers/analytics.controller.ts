import { Request, Response } from 'express';
import { AnalyticsService } from '../services/analyticsService';

export class AnalyticsController {
  /**
   * Store Owner Analytics Dashboard
   */
  static async getStoreAnalytics(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const analytics = await AnalyticsService.getStoreAnalytics(storeId);
      return res.json({ success: true, analytics });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Super Admin Platform-Wide SaaS Metrics Dashboard
   */
  static async getPlatformAnalytics(req: Request, res: Response) {
    try {
      const analytics = await AnalyticsService.getPlatformAnalytics();
      return res.json({ success: true, analytics });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
