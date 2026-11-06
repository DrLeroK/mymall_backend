import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { BillingCycle, PaymentStatus, StoreStatus } from '@prisma/client';
import { notifyStore, notifySuperAdmin } from '../sockets/socket';
import { BillingService } from '../services/billingService';
import { ChapaService } from '../services/chapaService';
import { StorageService } from '../services/storageService';
import { ReceiptService } from '../services/receiptService';

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

      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) {
        return res.status(404).json({ success: false, message: 'Store not found.' });
      }

      const paymentProofUrl = await StorageService.uploadFile(req.file, 'screenshots');
      const amount = BillingService.getCyclePrice(plan, billingCycle as BillingCycle);
      const upgradeDetails = BillingService.calculateUpgradeDetails(store, plan.id, billingCycle as BillingCycle);

      const subscription = await prisma.storeSubscription.create({
        data: {
          storeId,
          planId: plan.id,
          previousPlanId: upgradeDetails.previousPlanId,
          daysGranted: upgradeDetails.daysGranted,
          isUpgrade: upgradeDetails.isUpgrade,
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
      const upgradeDetails = BillingService.calculateUpgradeDetails(store, plan.id, billingCycle as BillingCycle);

      // Create pending subscription record with chapa txRef and upgrade details
      const subscription = await prisma.storeSubscription.create({
        data: {
          storeId,
          planId: plan.id,
          previousPlanId: upgradeDetails.previousPlanId,
          daysGranted: upgradeDetails.daysGranted,
          isUpgrade: upgradeDetails.isUpgrade,
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

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const cleanUserEmail = (user.email || '').replace(/['"]/g, '').trim();
      const bodyEmail = (req.body.email || '').replace(/['"]/g, '').trim();
      const smtpEmail = (process.env.SMTP_USER || '').replace(/['"]/g, '').trim();

      // Check if user email is a real, valid public domain email
      const isPublicDomain = (em: string) => {
        if (!emailRegex.test(em)) return false;
        const lower = em.toLowerCase();
        // Disallow internal / test domains that Chapa rejects
        return !lower.endsWith('.local') && !lower.endsWith('.et') && !lower.endsWith('.test') && !lower.endsWith('@example.com');
      };

      const emailToUse = (bodyEmail && isPublicDomain(bodyEmail))
        ? bodyEmail
        : (cleanUserEmail && isPublicDomain(cleanUserEmail))
          ? cleanUserEmail
          : (smtpEmail && isPublicDomain(smtpEmail))
            ? smtpEmail
            : 'abuabat521@gmail.com';

      const finalReturnUrl = returnUrl
        ? `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}txRef=${txRef}`
        : `${process.env.FRONTEND_URL || 'http://localhost:3003'}/merchant/billing?payment=chapa_success&txRef=${txRef}`;

      // Initialize with Chapa
      const chapaRes = await ChapaService.initializePayment({
        amount,
        currency: 'ETB',
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

      let subscription = await prisma.storeSubscription.findUnique({
        where: { chapaTxRef: txRef },
        include: { store: true, plan: true },
      });

      // If not found by exact txRef, search by storeId from auth/context or query
      if (!subscription) {
        const queryStoreId = req.query.storeId ? parseInt(req.query.storeId as string, 10) : undefined;
        const storeId = req.storeId || req.user?.storeId || queryStoreId;

        if (storeId) {
          subscription = await prisma.storeSubscription.findFirst({
            where: { storeId, paymentMethod: 'CHAPA', status: PaymentStatus.PENDING_APPROVAL },
            orderBy: { createdAt: 'desc' },
            include: { store: true, plan: true },
          });
        }
      }

      // If still not found, search by user's owned stores
      if (!subscription && req.user?.id) {
        const ownedStores = await prisma.store.findMany({
          where: { ownerId: req.user.id },
          select: { id: true },
        });
        const storeIds = ownedStores.map((s) => s.id);
        if (storeIds.length > 0) {
          subscription = await prisma.storeSubscription.findFirst({
            where: { storeId: { in: storeIds }, paymentMethod: 'CHAPA', status: PaymentStatus.PENDING_APPROVAL },
            orderBy: { createdAt: 'desc' },
            include: { store: true, plan: true },
          });
        }
      }

      if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription transaction not found.' });
      }

      const actualTxRef = subscription.chapaTxRef || txRef;

      if (subscription.status === PaymentStatus.APPROVED) {
        // If approved but missing digital receipt file, generate and save it now
        if (!subscription.paymentProofUrl || subscription.paymentProofUrl === 'CHAPA_GATEWAY') {
          try {
            const invoiceNumber = `INV-MALL-${subscription.storeId}-${subscription.id}`;
            const receiptUrl = await ReceiptService.generateSubscriptionReceiptFile({
              storeName: subscription.store.name,
              planName: subscription.plan.name,
              amount: Number(subscription.amount),
              currency: subscription.store.currency || 'ETB',
              invoiceNumber,
              txRef: actualTxRef,
              paymentDate: subscription.startDate || subscription.createdAt,
              isUpgrade: subscription.isUpgrade,
              ownerName: subscription.store.name,
              ownerEmail: subscription.store.contactEmail || undefined,
            });
            await prisma.storeSubscription.update({
              where: { id: subscription.id },
              data: { paymentProofUrl: receiptUrl },
            });
            subscription.paymentProofUrl = receiptUrl;
          } catch {}
        }
        return res.json({ success: true, message: 'Subscription already activated.', subscription });
      }

      const chapaVerification = await ChapaService.verifyPayment(actualTxRef);
      const isSimulate = process.env.NODE_ENV !== 'production' && req.query.simulateSuccess === 'true';

      if (!isSimulate && (!chapaVerification.success || chapaVerification.status !== 'success')) {
        return res.status(400).json({ success: false, message: 'Chapa payment verification failed or payment is pending.' });
      }

      // Activate Subscription Immediately
      const store = await prisma.store.findUnique({ where: { id: subscription.storeId } });
      const upgradeDetails = BillingService.calculateUpgradeDetails(
        store || {},
        subscription.planId,
        subscription.billingCycle
      );
      const now = new Date();
      const invoiceNumber = `INV-MALL-${subscription.storeId}-${Date.now().toString().slice(-6)}`;

      // Generate verifiable digital receipt document and store URL in paymentProofUrl
      let receiptUrl = 'CHAPA_GATEWAY';
      try {
        receiptUrl = await ReceiptService.generateSubscriptionReceiptFile({
          storeName: subscription.store.name,
          planName: subscription.plan.name,
          amount: Number(subscription.amount),
          currency: subscription.store.currency || 'ETB',
          invoiceNumber,
          txRef: actualTxRef,
          paymentDate: now,
          isUpgrade: upgradeDetails.isUpgrade,
          ownerName: subscription.store.name,
          ownerEmail: subscription.store.contactEmail || undefined,
        });
      } catch (receiptErr: any) {
        console.warn('Could not generate digital receipt file:', receiptErr.message);
      }

      const updatedSub = await prisma.storeSubscription.update({
        where: { id: subscription.id },
        data: {
          status: PaymentStatus.APPROVED,
          startDate: now,
          endDate: upgradeDetails.newEndDate,
          daysGranted: upgradeDetails.daysGranted,
          isUpgrade: upgradeDetails.isUpgrade,
          previousPlanId: upgradeDetails.previousPlanId,
          paymentProofUrl: receiptUrl,
          adminNotes: 'Automated instant activation via Chapa payment gateway.',
        },
      });

      // Update Store
      await prisma.store.update({
        where: { id: subscription.storeId },
        data: {
          status: StoreStatus.ACTIVE,
          currentPlanId: subscription.planId,
          isTrial: false,
          subscriptionEndsAt: upgradeDetails.newEndDate,
        },
      });

      // Generate Invoice
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          storeId: subscription.storeId,
          subscriptionId: subscription.id,
          amount: subscription.amount,
          currency: subscription.store.currency || 'ETB',
          status: 'PAID',
          paidAt: now,
        },
      });

      // Create Store Alert
      await prisma.alert.create({
        data: {
          storeId: subscription.storeId,
          type: 'PAYMENT_SUBMITTED',
          title: upgradeDetails.isUpgrade
            ? `🎉 Upgraded to ${subscription.plan.name}!`
            : `Subscription Activated: ${subscription.plan.name}`,
          message: upgradeDetails.isUpgrade
            ? `Your store has been upgraded to ${subscription.plan.name} with ${upgradeDetails.daysGranted} days access! Valid until ${upgradeDetails.newEndDate.toISOString().split('T')[0]}.`
            : `Your store subscription for ${subscription.plan.name} (${upgradeDetails.daysGranted} days) is now active until ${upgradeDetails.newEndDate.toISOString().split('T')[0]}.`,
        },
      });

      notifyStore(subscription.storeId, 'subscription:approved', {
        planName: subscription.plan.name,
        endDate: upgradeDetails.newEndDate,
        daysGranted: upgradeDetails.daysGranted,
        isUpgrade: upgradeDetails.isUpgrade,
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
      const statusParam = req.query.status as string | undefined;
      const whereClause: any = {};
      if (statusParam && statusParam.toUpperCase() !== 'ALL') {
        whereClause.status = statusParam as PaymentStatus;
      } else if (!statusParam) {
        whereClause.status = PaymentStatus.PENDING_APPROVAL;
      }

      const verifications = await prisma.storeSubscription.findMany({
        where: whereClause,
        include: {
          store: {
            include: {
              owner: {
                select: { id: true, name: true, email: true, phone: true },
              },
            },
          },
          plan: true,
          invoices: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Calculate platform approved subscription income metrics
      const approvedSubs = await prisma.storeSubscription.findMany({
        where: { status: PaymentStatus.APPROVED },
        select: { amount: true, paymentMethod: true },
      });

      let totalIncome = 0;
      let chapaIncome = 0;
      let bankIncome = 0;

      approvedSubs.forEach((sub) => {
        const amt = Number(sub.amount) || 0;
        totalIncome += amt;
        if (sub.paymentMethod === 'CHAPA') {
          chapaIncome += amt;
        } else {
          bankIncome += amt;
        }
      });

      return res.json({
        success: true,
        verifications,
        summary: {
          totalIncome: Math.round(totalIncome * 100) / 100,
          chapaIncome: Math.round(chapaIncome * 100) / 100,
          bankIncome: Math.round(bankIncome * 100) / 100,
          approvedCount: approvedSubs.length,
        },
      });
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
        const store = await prisma.store.findUnique({ where: { id: subscription.storeId } });
        const upgradeDetails = BillingService.calculateUpgradeDetails(
          store || {},
          subscription.planId,
          subscription.billingCycle
        );
        const now = new Date();

        const invoiceNumber = `INV-MALL-${subscription.storeId}-${Date.now().toString().slice(-6)}`;

        let receiptUrl = subscription.paymentProofUrl;
        if (!receiptUrl || receiptUrl === 'CHAPA_GATEWAY' || subscription.paymentMethod === 'CHAPA') {
          try {
            receiptUrl = await ReceiptService.generateSubscriptionReceiptFile({
              storeName: subscription.store.name,
              planName: subscription.plan.name,
              amount: Number(subscription.amount),
              currency: subscription.store.currency || 'ETB',
              invoiceNumber,
              txRef: subscription.chapaTxRef || `SUB-${subscription.storeId}-${Date.now()}`,
              paymentDate: now,
              isUpgrade: upgradeDetails.isUpgrade,
              ownerName: subscription.store.name,
              ownerEmail: subscription.store.contactEmail || undefined,
            });
          } catch (err: any) {
            console.warn('Could not generate receipt file during admin approval:', err.message);
          }
        }

        // Update Subscription record
        const updatedSub = await prisma.storeSubscription.update({
          where: { id: subscriptionId },
          data: {
            status: PaymentStatus.APPROVED,
            startDate: now,
            endDate: upgradeDetails.newEndDate,
            daysGranted: upgradeDetails.daysGranted,
            isUpgrade: upgradeDetails.isUpgrade,
            previousPlanId: upgradeDetails.previousPlanId,
            paymentProofUrl: receiptUrl,
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
            isTrial: false,
            subscriptionEndsAt: upgradeDetails.newEndDate,
          },
        });

        // Generate Invoice
        const invoice = await prisma.invoice.create({
          data: {
            invoiceNumber,
            storeId: subscription.storeId,
            subscriptionId: subscription.id,
            amount: subscription.amount,
            currency: subscription.store.currency || 'ETB',
            status: 'PAID',
            paidAt: now,
          },
        });

        // Create Store Alert
        await prisma.alert.create({
          data: {
            storeId: subscription.storeId,
            type: 'PAYMENT_SUBMITTED',
            title: upgradeDetails.isUpgrade
              ? `🎉 Upgraded to ${subscription.plan.name}!`
              : `Subscription Approved: ${subscription.plan.name}`,
            message: upgradeDetails.isUpgrade
              ? `Your store has been upgraded to ${subscription.plan.name} with ${upgradeDetails.daysGranted} days access! Valid until ${upgradeDetails.newEndDate.toISOString().split('T')[0]}.`
              : `Your subscription proof for ${subscription.plan.name} (${upgradeDetails.daysGranted} days) was verified and approved by admin. Active until ${upgradeDetails.newEndDate.toISOString().split('T')[0]}.`,
          },
        });

        notifyStore(subscription.storeId, 'subscription:approved', {
          planName: subscription.plan.name,
          endDate: upgradeDetails.newEndDate,
          daysGranted: upgradeDetails.daysGranted,
          isUpgrade: upgradeDetails.isUpgrade,
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
        include: { plan: true, previousPlan: true, invoices: true },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, invoices, subscriptions });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Store Subscription History & Active Plan Details (Store Owner & Staff)
   */
  static async getSubscriptionHistory(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;

      const store = await prisma.store.findUnique({
        where: { id: storeId },
        include: {
          plan: true,
        },
      });

      if (!store) {
        return res.status(404).json({ success: false, message: 'Store not found.' });
      }

      // Fetch all subscriptions in reverse chronological order
      const subscriptions = await prisma.storeSubscription.findMany({
        where: { storeId },
        include: {
          plan: true,
          previousPlan: true,
          invoices: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Find currently active subscription (approved and ending in the future)
      const now = new Date();
      const activeSubscription = subscriptions.find(
        (sub) => sub.status === PaymentStatus.APPROVED && sub.endDate && new Date(sub.endDate) > now
      ) || null;

      // Calculate days remaining
      let daysRemaining: number | null = null;
      const endsAt = store.subscriptionEndsAt || (activeSubscription ? activeSubscription.endDate : null);
      if (endsAt) {
        const diffMs = new Date(endsAt).getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }

      return res.json({
        success: true,
        store: {
          id: store.id,
          name: store.name,
          status: store.status,
          currentPlanId: store.currentPlanId,
          plan: store.plan,
          isTrial: store.isTrial,
          trialEndsAt: store.trialEndsAt,
          subscriptionEndsAt: store.subscriptionEndsAt,
          daysRemaining,
        },
        activeSubscription: activeSubscription
          ? {
              id: activeSubscription.id,
              plan: activeSubscription.plan,
              previousPlan: activeSubscription.previousPlan,
              isUpgrade: activeSubscription.isUpgrade,
              daysGranted: activeSubscription.daysGranted,
              billingCycle: activeSubscription.billingCycle,
              startDate: activeSubscription.startDate,
              endDate: activeSubscription.endDate,
              paymentMethod: activeSubscription.paymentMethod,
              amount: activeSubscription.amount,
            }
          : null,
        subscriptions,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Accounting Ledger: Complete Credits & Debits Ledger for Store Accountant
   */
  static async getAccountingLedger(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const filterType = ((req.query.type as string) || 'ALL').toUpperCase();

      // 1. Fetch Online Orders (Credits: customer payments received)
      const orders = await prisma.order.findMany({
        where: {
          storeId,
          status: { in: ['COMPLETED', 'SHIPPED', 'PAID', 'PROCESSING', 'READY_FOR_PICKUP'] as any },
        },
        include: {
          items: {
            include: {
              product: { select: { costPrice: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // 2. Fetch Offline POS Sales (Credits: in-store sales)
      const posSales = await prisma.pOSSale.findMany({
        where: { storeId },
        include: {
          cashier: { select: { name: true } },
          items: {
            include: {
              product: { select: { costPrice: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // 3. Fetch Store Subscriptions & Invoices (Debits: platform subscription overhead expenses)
      const invoices = await prisma.invoice.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
      });

      // Construct Ledger Entries
      const ledgerEntries: {
        id: string;
        date: Date;
        type: 'CREDIT' | 'DEBIT';
        category: 'ONLINE_SALE' | 'POS_SALE' | 'COGS' | 'SUBSCRIPTION_FEE' | 'REFUND';
        reference: string;
        description: string;
        amount: number;
        paymentMethod: string;
        status: string;
      }[] = [];

      let totalCredits = 0;
      let totalDebits = 0;

      // Online Sales -> Credits & Product Cost -> Debits
      for (const o of orders) {
        const orderAmount = Number(o.totalAmount);
        totalCredits += orderAmount;
        ledgerEntries.push({
          id: `ord_${o.id}`,
          date: o.createdAt,
          type: 'CREDIT',
          category: 'ONLINE_SALE',
          reference: o.orderNumber,
          description: `Online Order Revenue (${o.customerName})`,
          amount: orderAmount,
          paymentMethod: o.paymentMethod,
          status: o.status,
        });

        // Calculate Cost of Goods Sold (COGS) as Debit entry
        const cogs = o.items.reduce((acc: number, it: any) => acc + Number(it.product.costPrice || 0) * it.quantity, 0);
        if (cogs > 0) {
          totalDebits += cogs;
          ledgerEntries.push({
            id: `cogs_ord_${o.id}`,
            date: o.createdAt,
            type: 'DEBIT',
            category: 'COGS',
            reference: `COGS-${o.orderNumber}`,
            description: `Inventory Cost for Order #${o.orderNumber}`,
            amount: Number(cogs.toFixed(2)),
            paymentMethod: 'INVENTORY_COST',
            status: 'POSTED',
          });
        }
      }

      // POS Sales -> Credits & Product Cost -> Debits
      for (const s of posSales) {
        const saleAmount = Number(s.netAmount);
        totalCredits += saleAmount;
        ledgerEntries.push({
          id: `pos_${s.id}`,
          date: s.createdAt,
          type: 'CREDIT',
          category: 'POS_SALE',
          reference: s.receiptNumber,
          description: `In-Store POS Sale (Cashier: ${s.cashier.name})`,
          amount: saleAmount,
          paymentMethod: s.paymentMethod,
          status: 'COMPLETED',
        });

        const cogs = s.items.reduce((acc: number, it: any) => acc + Number(it.product.costPrice || 0) * it.quantity, 0);
        if (cogs > 0) {
          totalDebits += cogs;
          ledgerEntries.push({
            id: `cogs_pos_${s.id}`,
            date: s.createdAt,
            type: 'DEBIT',
            category: 'COGS',
            reference: `COGS-${s.receiptNumber}`,
            description: `Inventory Cost for POS #${s.receiptNumber}`,
            amount: Number(cogs.toFixed(2)),
            paymentMethod: 'INVENTORY_COST',
            status: 'POSTED',
          });
        }
      }

      // Invoices -> Debits
      for (const inv of invoices) {
        const invAmount = Number(inv.amount);
        totalDebits += invAmount;
        ledgerEntries.push({
          id: `inv_${inv.id}`,
          date: inv.paidAt || inv.createdAt,
          type: 'DEBIT',
          category: 'SUBSCRIPTION_FEE',
          reference: inv.invoiceNumber,
          description: `Platform Subscription Billing Fee`,
          amount: invAmount,
          paymentMethod: 'BILLING',
          status: inv.status,
        });
      }

      // Sort entries newest first
      let sortedEntries = ledgerEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (filterType === 'CREDIT') {
        sortedEntries = sortedEntries.filter((e) => e.type === 'CREDIT');
      } else if (filterType === 'DEBIT') {
        sortedEntries = sortedEntries.filter((e) => e.type === 'DEBIT');
      }

      const netCashFlow = totalCredits - totalDebits;

      return res.json({
        success: true,
        entries: sortedEntries,
        summary: {
          totalCredits: Number(totalCredits.toFixed(2)),
          totalDebits: Number(totalDebits.toFixed(2)),
          netCashFlow: Number(netCashFlow.toFixed(2)),
          totalEntries: sortedEntries.length,
          currency: 'ETB',
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
