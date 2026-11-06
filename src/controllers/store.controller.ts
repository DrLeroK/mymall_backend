import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Role, StoreStatus } from '@prisma/client';
import { StoreService } from '../services/storeService';
import { StorageService } from '../services/storageService';
import { generateTokens } from '../utils/jwt';

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
        currency = 'ETB',
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

      // Check uploaded files if present
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      let logoUrl = req.body.logoUrl || null;
      let bannerUrl = req.body.bannerUrl || null;
      if (files?.logo && files.logo.length > 0) {
        logoUrl = await StorageService.uploadFile(files.logo[0], 'branding');
      }
      if (files?.banner && files.banner.length > 0) {
        bannerUrl = await StorageService.uploadFile(files.banner[0], 'branding');
      }

      const store = await StoreService.createStore(ownerId, {
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
        taxRate: taxRate !== undefined ? parseFloat(taxRate) : 15.0,
        deliveryFee: req.body.deliveryFee !== undefined ? parseFloat(req.body.deliveryFee) : 50.0,
        primaryColor,
        secondaryColor,
        accentColor,
        hideOutOfStock: Boolean(req.body.hideOutOfStock),
        returnPolicy: req.body.returnPolicy,
        businessHours: req.body.businessHours,
        chapaPublicKey: req.body.chapaPublicKey,
        chapaSecretKey: req.body.chapaSecretKey,
      });

      const tokens = generateTokens({
        id: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        role: Role.STORE_OWNER,
        storeId: store.id,
        permissions: [],
      });

      return res.status(201).json({
        success: true,
        message: 'Store onboarded successfully with 5-day free trial.',
        store,
        tokens,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || 500;
      return res.status(statusCode).json({ success: false, message: error.message });
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
        deliveryFee,
        returnPolicy,
        businessHours,
        primaryColor,
        secondaryColor,
        accentColor,
        hideOutOfStock,
        contactEmail,
        contactPhone,
        address,
        chapaPublicKey,
        chapaSecretKey,
        chapaWebhookSecret,
      } = req.body;

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      let logoUrl: string | undefined = req.body.logoUrl !== undefined ? req.body.logoUrl : undefined;
      let bannerUrl: string | undefined = req.body.bannerUrl !== undefined ? req.body.bannerUrl : undefined;
      if (files?.logo && files.logo.length > 0) {
        logoUrl = await StorageService.uploadFile(files.logo[0], 'branding');
      }
      if (files?.banner && files.banner.length > 0) {
        bannerUrl = await StorageService.uploadFile(files.banner[0], 'branding');
      }

      const updatedStore = await StoreService.updateStoreSettings(storeId, req.user!.id, req.user!.role, {
        name,
        tagline,
        description,
        currency,
        taxRate: taxRate !== undefined ? parseFloat(taxRate) : undefined,
        deliveryFee: deliveryFee !== undefined ? parseFloat(deliveryFee) : undefined,
        returnPolicy,
        businessHours: typeof businessHours === 'object' ? JSON.stringify(businessHours) : businessHours,
        primaryColor,
        secondaryColor,
        accentColor,
        hideOutOfStock: hideOutOfStock !== undefined ? Boolean(hideOutOfStock) : undefined,
        contactEmail,
        contactPhone,
        address,
        logoUrl,
        bannerUrl,
        chapaPublicKey,
        chapaSecretKey,
        chapaWebhookSecret,
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

      const now = new Date();
      const isUnderTrial = Boolean(
        (store?.isTrial && store.trialEndsAt && now <= store.trialEndsAt) ||
        (store?.subscriptionEndsAt && now <= store.subscriptionEndsAt)
      );
      const hasActiveSubscription = Boolean(store?.subscriptions && store.subscriptions.length > 0) || isUnderTrial;

      return res.json({ success: true, store, hasActiveSubscription, isUnderTrial, isSuspended: req.isSuspended });
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

  /**
   * Super Admin: List all registered store owners and their store portfolios
   */
  static async adminListStoreOwners(req: Request, res: Response) {
    try {
      const owners = await prisma.user.findMany({
        where: {
          OR: [
            { role: Role.STORE_OWNER },
            { ownedStores: { some: {} } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          avatarUrl: true,
          isEmailVerified: true,
          createdAt: true,
          updatedAt: true,
          ownedStores: {
            include: {
              plan: true,
              _count: { select: { products: true, orders: true, staff: true, posSales: true } },
              subscriptions: {
                where: { status: 'APPROVED' },
                orderBy: { endDate: 'desc' },
                take: 1,
                include: { plan: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, count: owners.length, owners });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
