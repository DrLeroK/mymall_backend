import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Role, StoreStatus } from '@prisma/client';

export class StoreController {
  /**
   * Store Registration Onboarding Flow
   */
  static async onboardStore(req: Request, res: Response) {
    try {
      const ownerId = req.user!.id;
      const {
        name,
        slug,
        tagline,
        description,
        category = 'General',
        contactEmail,
        contactPhone,
        address,
        currency = 'USD',
        taxRate = 0,
        primaryColor = '#3b82f6',
        secondaryColor = '#1e293b',
        accentColor = '#f59e0b',
        planId,
      } = req.body;

      if (!name || !slug) {
        return res.status(400).json({ success: false, message: 'Store name and custom subdomain/slug are required.' });
      }

      // Format slug
      const formattedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');

      // Check slug uniqueness
      const existingSlug = await prisma.store.findUnique({ where: { slug: formattedSlug } });
      if (existingSlug) {
        return res.status(400).json({ success: false, message: `Subdomain/slug '${formattedSlug}' is already taken.` });
      }

      // Check uploaded files if present
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const logoUrl = files?.logo ? `/uploads/branding/${files.logo[0].filename}` : req.body.logoUrl || null;
      const bannerUrl = files?.banner ? `/uploads/branding/${files.banner[0].filename}` : req.body.bannerUrl || null;

      // Select Plan
      let targetPlan = null;
      if (planId) {
        targetPlan = await prisma.subscriptionPlan.findUnique({ where: { id: parseInt(planId, 10) } });
      }
      if (!targetPlan) {
        targetPlan = await prisma.subscriptionPlan.findFirst({ where: { isActive: true } });
      }

      const subscriptionEndsAt = new Date();
      subscriptionEndsAt.setDate(subscriptionEndsAt.getDate() + 14); // 14-day free trial / initial period

      const store = await prisma.store.create({
        data: {
          name,
          slug: formattedSlug,
          tagline,
          description,
          category,
          logoUrl,
          bannerUrl,
          contactEmail: contactEmail || req.user!.email,
          contactPhone,
          address,
          currency,
          taxRate: parseFloat(taxRate),
          primaryColor,
          secondaryColor,
          accentColor,
          ownerId,
          currentPlanId: targetPlan?.id || null,
          status: StoreStatus.ACTIVE,
          subscriptionEndsAt,
        },
      });

      // Update User role to STORE_OWNER and attach storeId
      await prisma.user.update({
        where: { id: ownerId },
        data: {
          role: Role.STORE_OWNER,
          storeId: store.id,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Store onboarded successfully.',
        store,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update Store Settings (business hours, currency, tax rate, return policy, branding colors)
   */
  static async updateSettings(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const {
        name,
        tagline,
        description,
        currency,
        taxRate,
        returnPolicy,
        businessHours,
        primaryColor,
        secondaryColor,
        accentColor,
        hideOutOfStock,
        contactEmail,
        contactPhone,
        address,
      } = req.body;

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const logoUrl = files?.logo ? `/uploads/branding/${files.logo[0].filename}` : undefined;
      const bannerUrl = files?.banner ? `/uploads/branding/${files.banner[0].filename}` : undefined;

      const updatedStore = await prisma.store.update({
        where: { id: storeId },
        data: {
          ...(name && { name }),
          ...(tagline !== undefined && { tagline }),
          ...(description !== undefined && { description }),
          ...(currency && { currency }),
          ...(taxRate !== undefined && { taxRate: parseFloat(taxRate) }),
          ...(returnPolicy !== undefined && { returnPolicy }),
          ...(businessHours !== undefined && { businessHours: typeof businessHours === 'object' ? JSON.stringify(businessHours) : businessHours }),
          ...(primaryColor && { primaryColor }),
          ...(secondaryColor && { secondaryColor }),
          ...(accentColor && { accentColor }),
          ...(hideOutOfStock !== undefined && { hideOutOfStock: Boolean(hideOutOfStock) }),
          ...(contactEmail && { contactEmail }),
          ...(contactPhone && { contactPhone }),
          ...(address && { address }),
          ...(logoUrl && { logoUrl }),
          ...(bannerUrl && { bannerUrl }),
        },
      });

      return res.json({
        success: true,
        message: 'Store settings updated successfully.',
        store: updatedStore,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Store Details
   */
  static async getMyStore(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        include: {
          plan: true,
          subscriptions: {
            where: { status: 'APPROVED', endDate: { gte: new Date() } },
            orderBy: { endDate: 'desc' },
            take: 1,
          },
          owner: { select: { id: true, name: true, email: true, phone: true } },
          _count: { select: { products: true, staff: true, orders: true } },
        },
      });

      const hasActiveSubscription = Boolean(store?.subscriptions && store.subscriptions.length > 0);

      return res.json({ success: true, store, hasActiveSubscription, isSuspended: req.isSuspended });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // STORE BANK ACCOUNTS FOR MANUAL PAYMENTS
  // ==========================================

  /**
   * Get Store Bank Accounts (Store Owner / Staff)
   */
  static async getBankAccounts(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const accounts = await prisma.storeBankAccount.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ success: true, accounts });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create Store Bank Account (Store Owner)
   */
  static async createBankAccount(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { bankName, accountName, accountNumber, instructions, qrCodeUrl } = req.body;

      if (!bankName || !accountName || !accountNumber) {
        return res.status(400).json({ success: false, message: 'bankName, accountName, and accountNumber are required.' });
      }

      const account = await prisma.storeBankAccount.create({
        data: {
          storeId,
          bankName,
          accountName,
          accountNumber,
          instructions,
          qrCodeUrl,
          isActive: true,
        },
      });

      return res.status(201).json({ success: true, message: 'Bank account added successfully.', account });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update Store Bank Account (Store Owner)
   */
  static async updateBankAccount(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const id = parseInt(req.params.id, 10);
      const { bankName, accountName, accountNumber, instructions, qrCodeUrl, isActive } = req.body;

      const account = await prisma.storeBankAccount.findFirst({ where: { id, storeId } });
      if (!account) return res.status(404).json({ success: false, message: 'Bank account not found.' });

      const updated = await prisma.storeBankAccount.update({
        where: { id },
        data: {
          ...(bankName && { bankName }),
          ...(accountName && { accountName }),
          ...(accountNumber && { accountNumber }),
          ...(instructions !== undefined && { instructions }),
          ...(qrCodeUrl !== undefined && { qrCodeUrl }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });

      return res.json({ success: true, message: 'Bank account updated successfully.', account: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete Store Bank Account (Store Owner)
   */
  static async deleteBankAccount(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const id = parseInt(req.params.id, 10);

      const account = await prisma.storeBankAccount.findFirst({ where: { id, storeId } });
      if (!account) return res.status(404).json({ success: false, message: 'Bank account not found.' });

      await prisma.storeBankAccount.delete({ where: { id } });
      return res.json({ success: true, message: 'Bank account deleted successfully.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Configure Store Custom Chapa Payment Keys (Store Owner)
   */
  static async updatePaymentKeys(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { chapaSecretKey, chapaPublicKey, chapaWebhookSecret } = req.body;

      await prisma.store.update({
        where: { id: storeId },
        data: {
          ...(chapaSecretKey !== undefined && { chapaSecretKey }),
          ...(chapaPublicKey !== undefined && { chapaPublicKey }),
          ...(chapaWebhookSecret !== undefined && { chapaWebhookSecret }),
        },
      });

      return res.json({
        success: true,
        message: 'Store Chapa payment credentials updated successfully.',
        hasCustomChapa: Boolean(chapaSecretKey),
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Super Admin: List all stores
   */
  static async adminListStores(req: Request, res: Response) {
    try {
      const stores = await prisma.store.findMany({
        include: {
          owner: { select: { id: true, name: true, email: true, phone: true } },
          plan: { select: { id: true, name: true, monthlyPrice: true, maxProducts: true } },
          _count: { select: { products: true, staff: true, orders: true } },
          subscriptions: {
            where: { status: 'APPROVED' },
            orderBy: { endDate: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, count: stores.length, stores });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Super Admin: Get specific store details
   */
  static async adminGetStore(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      const store = await prisma.store.findUnique({
        where: { id },
        include: {
          owner: { select: { id: true, name: true, email: true, phone: true } },
          plan: true,
          bankAccounts: true,
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          _count: { select: { products: true, staff: true, orders: true, posSales: true } },
        },
      });

      if (!store) {
        return res.status(404).json({ success: false, message: 'Store not found.' });
      }

      return res.json({ success: true, store });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Super Admin: Update store status (Activate, Suspend, etc.)
   */
  static async adminUpdateStoreStatus(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      const { status } = req.body;

      if (!status || !Object.values(StoreStatus).includes(status)) {
        return res.status(400).json({ success: false, message: 'Valid store status is required.' });
      }

      const store = await prisma.store.update({
        where: { id },
        data: { status },
      });

      return res.json({ success: true, message: `Store status updated to ${status}.`, store });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
