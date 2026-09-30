import { Request, Response } from 'express';
import { POSService } from '../services/posService';
import { prisma } from '../config/db';

export class POSController {
  /**
   * Log Physical Sale in POS Interface
   */
  static async createSale(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const cashierId = req.user!.id;
      const { customerName, customerPhone, discountAmount, paymentMethod, paymentDetails, offlineId, notes, items } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Sale items array is required.' });
      }

      const result = await POSService.createPOSSale({
        storeId,
        cashierId,
        customerName,
        customerPhone,
        discountAmount,
        paymentMethod,
        paymentDetails,
        offlineId,
        notes,
        items,
      });

      return res.status(201).json({
        success: true,
        message: result.alreadyProcessed ? 'Sale was already reconciled.' : 'POS sale completed successfully.',
        sale: result.sale,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Offline-First Queue Sync Reconciliation Endpoint
   */
  static async syncOffline(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const cashierId = req.user!.id;
      const { batchSales } = req.body;

      if (!batchSales || !Array.isArray(batchSales)) {
        return res.status(400).json({ success: false, message: 'batchSales array is required.' });
      }

      const reconciliationResults = await POSService.reconcileOfflineSales(storeId, cashierId, batchSales);

      return res.json({
        success: true,
        message: `Offline sync completed for ${batchSales.length} queued sales.`,
        results: reconciliationResults,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Receipt HTML & Data for POS Printing
   */
  static async getReceipt(req: Request, res: Response) {
    try {
      const saleId = parseInt(req.params.id, 10);
      const { receiptData, html } = await POSService.getReceipt(saleId);

      if (req.query.format === 'html') {
        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
      }

      return res.json({ success: true, receiptData, html });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  /**
   * Cash Drawer & Payment Reconciliation Report
   */
  static async getReconciliation(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const dateStr = req.query.date as string;
      const report = await POSService.getDailyReconciliation(storeId, dateStr);

      return res.json({ success: true, report });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * List POS Sales for Store
   */
  static async listSales(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const sales = await prisma.pOSSale.findMany({
        where: { storeId },
        include: { cashier: { select: { id: true, name: true } }, items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ success: true, count: sales.length, sales });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
