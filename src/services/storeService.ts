import { prisma } from '../config/db';
import { Role, StoreStatus } from '@prisma/client';

export class StoreServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'StoreServiceError';
    this.statusCode = statusCode;
  }
}

export class StoreService {
  static async createStore(
    ownerId: number,
    data: {
      name: string;
      slug: string;
      tagline?: string;
      description?: string;
      category?: string;
      logoUrl?: string;
      bannerUrl?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      currency?: string;
      taxRate?: number;
      deliveryFee?: number;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      hideOutOfStock?: boolean;
      returnPolicy?: string;
      businessHours?: string;
      chapaPublicKey?: string;
      chapaSecretKey?: string;
    }
  ) {
    const cleanSlug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const existing = await prisma.store.findUnique({ where: { slug: cleanSlug } });
    if (existing) {
      throw new StoreServiceError('A store with this slug/subdomain already exists.', 409);
    }

    // Auto-provision 5-Day Free Trial on Starter plan
    const starterPlan = await prisma.subscriptionPlan.findFirst({
      where: { name: 'Starter', isActive: true },
    });

    const now = new Date();
    const trialDays = starterPlan?.trialDays || 5;
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const store = await prisma.store.create({
      data: {
        name: data.name,
        slug: cleanSlug,
        tagline: data.tagline,
        description: data.description,
        category: data.category || 'General',
        logoUrl: data.logoUrl,
        bannerUrl: data.bannerUrl,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        address: data.address,
        currency: data.currency || 'ETB',
        taxRate: data.taxRate !== undefined ? data.taxRate : 15.0,
        deliveryFee: data.deliveryFee !== undefined ? data.deliveryFee : 50.00,
        primaryColor: data.primaryColor || '#4f46e5',
        secondaryColor: data.secondaryColor || '#0f172a',
        accentColor: data.accentColor || '#f59e0b',
        hideOutOfStock: data.hideOutOfStock ?? false,
        returnPolicy: data.returnPolicy,
        businessHours: data.businessHours,
        chapaPublicKey: data.chapaPublicKey,
        chapaSecretKey: data.chapaSecretKey,
        ownerId,
        currentPlanId: starterPlan?.id,
        isTrial: true,
        trialEndsAt,
        subscriptionEndsAt: trialEndsAt,
        status: StoreStatus.ACTIVE,
      },
      include: {
        plan: true,
      },
    });

    // Update user role to STORE_OWNER if currently CUSTOMER
    await prisma.user.update({
      where: { id: ownerId },
      data: {
        role: Role.STORE_OWNER,
        storeId: store.id,
      },
    });

    return store;
  }

  static async updateStoreSettings(
    storeId: number,
    userId: number,
    userRole: Role,
    data: {
      name?: string;
      tagline?: string;
      description?: string;
      category?: string;
      logoUrl?: string;
      bannerUrl?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      currency?: string;
      taxRate?: number;
      deliveryFee?: number;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      hideOutOfStock?: boolean;
      returnPolicy?: string;
      businessHours?: string;
      chapaPublicKey?: string;
      chapaSecretKey?: string;
      chapaWebhookSecret?: string;
    }
  ) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new StoreServiceError('Store not found.', 404);
    }

    if (userRole !== Role.SUPER_ADMIN && store.ownerId !== userId) {
      throw new StoreServiceError('You do not have permission to update settings for this store.', 403);
    }

    const updated = await prisma.store.update({
      where: { id: storeId },
      data: {
        ...data,
        taxRate: data.taxRate !== undefined ? data.taxRate : undefined,
        deliveryFee: data.deliveryFee !== undefined ? data.deliveryFee : undefined,
      },
      include: {
        plan: true,
      },
    });

    return updated;
  }

  static async getStoreById(storeId: number) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        plan: true,
        bankAccounts: { where: { isActive: true } },
      },
    });
    if (!store) {
      throw new StoreServiceError('Store not found.', 404);
    }
    return store;
  }

  static async getStoreBySlug(slug: string) {
    const store = await prisma.store.findUnique({
      where: { slug: slug.toLowerCase() },
      include: {
        plan: true,
        bankAccounts: { where: { isActive: true } },
      },
    });
    if (!store) {
      throw new StoreServiceError('Store not found.', 404);
    }
    return store;
  }
}
