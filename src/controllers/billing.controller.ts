import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { BillingCycle, PaymentStatus, StoreStatus } from '@prisma/client';
import { notifyStore, notifySuperAdmin } from '../sockets/socket';
import { BillingService } from '../services/billingService';
import { ChapaService } from '../services/chapaService';

export class BillingController {
  // ==========================================
  // 1. SUBSCRIPTION PLANS MANAGEMENT
  // ==========================================

  /**
   * List available active subscription plans (Public & Store Owners)
   */
  static async getPlans(req: Request, res: Response) {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { searchRankBoost: 'asc' },
      });
      return res.json({ success: true, plans });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create Subscription Plan (Super Admin)
   */
  static async createPlan(req: Request, res: Response) {
    try {
      const {
        name,
        description,
        monthlyPrice,
        threeMonthsPrice,
        sixMonthsPrice,
        yearlyPrice,
        maxProducts,
        maxStaff,
        searchRankBoost = 1,
        analyticsLevel = 'BASIC',
        customDomainAllowed = false,
      } = req.body;

      if (!name || monthlyPrice === undefined || yearlyPrice === undefined) {
        return res.status(400).json({ success: false, message: 'Plan name, monthlyPrice, and yearlyPrice are required.' });
      }

      const plan = await prisma.subscriptionPlan.create({
        data: {
          name,
          description,
          monthlyPrice: parseFloat(monthlyPrice),
          threeMonthsPrice: threeMonthsPrice !== undefined ? parseFloat(threeMonthsPrice) : parseFloat(monthlyPrice) * 3,
          sixMonthsPrice: sixMonthsPrice !== undefined ? parseFloat(sixMonthsPrice) : parseFloat(monthlyPrice) * 6,
          yearlyPrice: parseFloat(yearlyPrice),
          maxProducts: parseInt(maxProducts, 10) || 100,
          maxStaff: parseInt(maxStaff, 10) || 3,
          searchRankBoost: parseInt(searchRankBoost, 10) || 1,
          analyticsLevel,
          customDomainAllowed: Boolean(customDomainAllowed),
          isActive: true,
        },
      });

      return res.status(201).json({ success: true, message: 'Subscription plan created successfully.', plan });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Edit / Update Subscription Plan (Super Admin)
   */
  static async updatePlan(req: Request, res: Response) {
    try {
      const planId = parseInt(req.params.id, 10);
      const {
        name,
        description,
        monthlyPrice,
        threeMonthsPrice,
        sixMonthsPrice,
        yearlyPrice,
        maxProducts,
        maxStaff,
        searchRankBoost,
        analyticsLevel,
        customDomainAllowed,
        isActive,
      } = req.body;

      const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Subscription plan not found.' });
      }

      const updated = await prisma.subscriptionPlan.update({
        where: { id: planId },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(monthlyPrice !== undefined && { monthlyPrice: parseFloat(monthlyPrice) }),
          ...(threeMonthsPrice !== undefined && { threeMonthsPrice: parseFloat(threeMonthsPrice) }),
          ...(sixMonthsPrice !== undefined && { sixMonthsPrice: parseFloat(sixMonthsPrice) }),
          ...(yearlyPrice !== undefined && { yearlyPrice: parseFloat(yearlyPrice) }),
          ...(maxProducts !== undefined && { maxProducts: parseInt(maxProducts, 10) }),
          ...(maxStaff !== undefined && { maxStaff: parseInt(maxStaff, 10) }),
          ...(searchRankBoost !== undefined && { searchRankBoost: parseInt(searchRankBoost, 10) }),
          ...(analyticsLevel && { analyticsLevel }),
          ...(customDomainAllowed !== undefined && { customDomainAllowed: Boolean(customDomainAllowed) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });

      return res.json({ success: true, message: 'Subscription plan updated successfully.', plan: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete / Deactivate Subscription Plan (Super Admin)
   */
  static async deletePlan(req: Request, res: Response) {
    try {
      const planId = parseInt(req.params.id, 10);
      // Soft-deactivate if stores are currently using it
      const countUsing = await prisma.store.count({ where: { currentPlanId: planId } });

      if (countUsing > 0) {
        await prisma.subscriptionPlan.update({
          where: { id: planId },
          data: { isActive: false },
        });
        return res.json({ success: true, message: 'Plan is active on registered stores. Successfully set to inactive.' });
      }

      await prisma.subscriptionPlan.delete({ where: { id: planId } });
      return res.json({ success: true, message: 'Subscription plan deleted successfully.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // 2. PLATFORM BANK ACCOUNTS MANAGEMENT
  // ==========================================

  /**
   * Get Active Platform Bank Accounts (Merchants view to make manual transfers)
   */
  static async getPlatformBankAccounts(req: Request, res: Response) {
    try {
      const accounts = await prisma.platformBankAccount.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      return res.json({ success: true, accounts });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * List all Platform Bank Accounts (Super Admin)
   */
  static async adminListPlatformBankAccounts(req: Request, res: Response) {
    try {
      const accounts = await prisma.platformBankAccount.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ success: true, accounts });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create Platform Bank Account (Super Admin)
   */
  static async adminCreatePlatformBankAccount(req: Request, res: Response) {
    try {
      const { bankName, accountName, accountNumber, instructions, qrCodeUrl } = req.body;
      if (!bankName || !accountName || !accountNumber) {
        return res.status(400).json({ success: false, message: 'bankName, accountName, and accountNumber are required.' });
      }

      const account = await prisma.platformBankAccount.create({
        data: {
          bankName,
          accountName,
          accountNumber,
          instructions,
          qrCodeUrl,
          isActive: true,
        },
      });

      return res.status(201).json({ success: true, message: 'Platform bank account created.', account });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update Platform Bank Account (Super Admin)
   */
  static async adminUpdatePlatformBankAccount(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      const { bankName, accountName, accountNumber, instructions, qrCodeUrl, isActive } = req.body;

      const account = await prisma.platformBankAccount.update({
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

      return res.json({ success: true, message: 'Platform bank account updated.', account });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete Platform Bank Account (Super Admin)
   */
  static async adminDeletePlatformBankAccount(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      await prisma.platformBankAccount.delete({ where: { id } });
      return res.json({ success: true, message: 'Platform bank account removed.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // 3. SUBSCRIPTIONS: SCREENSHOT PAYMENT
  // ==========================================

  /**
   * Submit Subscription Payment Verification Screenshot (Store Owner side)
   */
  static async subscribe(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { planId, billingCycle = BillingCycle.MONTHLY } = req.body;

      if (!planId) {
        return res.status(400).json({ success: false, message: 'planId is required.' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Payment verification screenshot image is required.' });
      }

      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: parseInt(planId, 10) } });
      if (!plan) {
        return res.status(404).json({ success: false, message: 'Selected plan not found.' });
      }

      const paymentProofUrl = `/uploads/screenshots/${req.file.filename}`;
      const amount = BillingService.getCyclePrice(plan, billingCycle as BillingCycle);

      const subscription = await prisma.storeSubscription.create({
        data: {
          storeId,
          planId: plan.id,
          billingCycle: billingCycle as BillingCycle,
          amount,
          paymentMethod: 'SCREENSHOT',
          paymentProofUrl,
          status: PaymentStatus.PENDING_APPROVAL,
        },
        include: { plan: true, store: true },
      });

      notifySuperAdmin('billing:new_verification_request', {
        subscriptionId: subscription.id,
        storeName: subscription.store.name,
        planName: plan.name,
        amount,
        cycle: billingCycle,
      });

      return res.status(201).json({
        success: true,
        message: 'Subscription payment verification screenshot submitted successfully. Platform admin will review shortly.',
        subscription,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // 4. SUBSCRIPTIONS: CHAPA PAYMENT GATEWAY
  // ==========================================

  /**
   * Initialize Chapa Payment Checkout for Store Subscription
   */
  static async initializeChapaSubscription(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const user = req.user!;
      const { planId, billingCycle = BillingCycle.MONTHLY, callbackUrl, returnUrl } = req.body;

      if (!planId) {
        return res.status(400).json({ success: false, message: 'planId is required.' });
      }

      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: parseInt(planId, 10) } });
      if (!plan) {
        return res.status(404).json({ success: false, message: 'Selected plan not found.' });
      }

      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) return res.status(404).json({ success: false, message: 'Store not found.' });

      const amount = BillingService.getCyclePrice(plan, billingCycle as BillingCycle);
      const txRef = `SUB-${storeId}-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

      // Create pending subscription record with chapa txRef
      const subscription = await prisma.storeSubscription.create({
        data: {
          storeId,
          planId: plan.id,
          billingCycle: billingCycle as BillingCycle,
          amount,
          paymentMethod: 'CHAPA',
          paymentProofUrl: 'CHAPA_GATEWAY',
          chapaTxRef: txRef,
          status: PaymentStatus.PENDING_APPROVAL,
        },
      });

      const [firstName, ...rest] = (user.name || 'Merchant').split(' ');
      const lastName = rest.join(' ') || 'Owner';

      const emailToUse = user.email.includes('@example.com') ? (process.env.SMTP_USER || 'customer@mymall.com') : user.email;

      const finalReturnUrl = returnUrl
        ? `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}txRef=${txRef}`
        : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/merchant/billing?payment=chapa_success&txRef=${txRef}`;

      // Initialize with Chapa
      const chapaRes = await ChapaService.initializePayment({
        amount,
        currency: store.currency === 'USD' ? 'USD' : 'ETB',
        email: emailToUse,
        firstName,
        lastName,
        txRef,
        callbackUrl,
        returnUrl: finalReturnUrl,
        title: 'MyMall Sub',
        description: `Subscription for ${store.name}`,
      });

      if (!chapaRes.success || !chapaRes.data) {
        return res.status(400).json({ success: false, message: chapaRes.message });
      }

      return res.status(201).json({
        success: true,
        message: 'Chapa checkout initialized.',
        checkoutUrl: chapaRes.data.checkoutUrl,
        txRef,
        subscriptionId: subscription.id,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Verify Chapa Subscription Transaction & Activate Store
   */
  static async verifyChapaSubscription(req: Request, res: Response) {
    try {
      const { txRef } = req.params;

      const subscription = await prisma.storeSubscription.findUnique({
        where: { chapaTxRef: txRef },
        include: { store: true, plan: true },
      });

      if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription transaction not found.' });
      }

      if (subscription.status === PaymentStatus.APPROVED) {
        return res.json({ success: true, message: 'Subscription already activated.', subscription });
      }

      const chapaVerification = await ChapaService.verifyPayment(txRef);
      const isSimulate = process.env.NODE_ENV !== 'production' && req.query.simulateSuccess === 'true';

      if (!isSimulate && (!chapaVerification.success || chapaVerification.status !== 'success')) {
        return res.status(400).json({ success: false, message: 'Chapa payment verification failed or payment is pending.' });
      }

      // Activate Subscription Immediately
      const now = new Date();
      const cycleDays = BillingService.getCycleDays(subscription.billingCycle);
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + cycleDays);

      const updatedSub = await prisma.storeSubscription.update({
        where: { id: subscription.id },
        data: {
          status: PaymentStatus.APPROVED,
          startDate: now,
          endDate,
          adminNotes: 'Automated instant activation via Chapa payment gateway.',
        },
      });

      // Update Store
      await prisma.store.update({
        where: { id: subscription.storeId },
        data: {
          status: StoreStatus.ACTIVE,
          currentPlanId: subscription.planId,
          subscriptionEndsAt: endDate,
        },
      });

      // Generate Invoice
      const invoiceNumber = `INV-MALL-${subscription.storeId}-${Date.now().toString().slice(-6)}`;
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          storeId: subscription.storeId,
          subscriptionId: subscription.id,
          amount: subscription.amount,
          currency: subscription.store.currency,
          status: 'PAID',
          paidAt: now,
        },
      });

      notifyStore(subscription.storeId, 'subscription:approved', {
        planName: subscription.plan.name,
        endDate,
        invoiceNumber,
      });

      return res.json({
        success: true,
        message: 'Payment verified successfully! Your store subscription is now ACTIVE.',
        subscription: updatedSub,
        invoice,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // 5. SUPER ADMIN VERIFICATIONS & INVOICES
  // ==========================================

  /**
   * List Subscription Verifications Queue (Super Admin)
   */
  static async listAdminVerifications(req: Request, res: Response) {
    try {
      const status = (req.query.status as PaymentStatus) || PaymentStatus.PENDING_APPROVAL;
      const verifications = await prisma.storeSubscription.findMany({
        where: {
          status,
        },
        include: {
          store: {
            include: {
              owner: {
                select: { id: true, name: true, email: true, phone: true },
              },
            },
          },
          plan: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, verifications });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Super Admin Review (Approve / Reject) Subscription Screenshot Payment
   */
  static async reviewVerification(req: Request, res: Response) {
    try {
      const subscriptionId = parseInt(req.params.id, 10);
      const { action, adminNotes } = req.body; // action: "APPROVE" or "REJECT"

      if (!['APPROVE', 'REJECT'].includes(action)) {
        return res.status(400).json({ success: false, message: 'action must be APPROVE or REJECT' });
      }

      const subscription = await prisma.storeSubscription.findUnique({
        where: { id: subscriptionId },
        include: { store: true, plan: true },
      });

      if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription request not found.' });
      }

      const adminId = req.user!.id;

      if (action === 'APPROVE') {
        const now = new Date();
        const daysToAdd = BillingService.getCycleDays(subscription.billingCycle);

        const startDate = now;
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + daysToAdd);

        // Update Subscription record
        const updatedSub = await prisma.storeSubscription.update({
          where: { id: subscriptionId },
          data: {
            status: PaymentStatus.APPROVED,
            startDate,
            endDate,
            adminNotes,
            reviewedById: adminId,
          },
        });

        // Update Store Status and Current Plan
        await prisma.store.update({
          where: { id: subscription.storeId },
          data: {
            status: StoreStatus.ACTIVE,
            currentPlanId: subscription.planId,
            subscriptionEndsAt: endDate,
          },
        });

        // Generate Invoice
        const invoiceNumber = `INV-MALL-${subscription.storeId}-${Date.now().toString().slice(-6)}`;
        const invoice = await prisma.invoice.create({
          data: {
            invoiceNumber,
            storeId: subscription.storeId,
            subscriptionId: subscription.id,
            amount: subscription.amount,
            currency: subscription.store.currency,
            status: 'PAID',
            paidAt: now,
          },
        });

        notifyStore(subscription.storeId, 'subscription:approved', {
          planName: subscription.plan.name,
          endDate,
          invoiceNumber,
        });

        return res.json({
          success: true,
          message: 'Subscription payment proof approved successfully. Store activated.',
          subscription: updatedSub,
          invoice,
        });
      } else {
        const updatedSub = await prisma.storeSubscription.update({
          where: { id: subscriptionId },
          data: {
            status: PaymentStatus.REJECTED,
            adminNotes: adminNotes || 'Payment verification rejected by admin.',
            reviewedById: adminId,
          },
        });

        notifyStore(subscription.storeId, 'subscription:rejected', {
          reason: adminNotes || 'Payment screenshot rejected.',
        });

        return res.json({
          success: true,
          message: 'Subscription payment proof rejected.',
          subscription: updatedSub,
        });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Store Invoices & Payment History
   */
  static async getInvoices(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const invoices = await prisma.invoice.findMany({
        where: { storeId },
        include: { subscription: { include: { plan: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const subscriptions = await prisma.storeSubscription.findMany({
        where: { storeId },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, invoices, subscriptions });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
