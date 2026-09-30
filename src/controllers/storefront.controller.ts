import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { StoreStatus } from '@prisma/client';
import { SearchService } from '../services/searchService';

export class StorefrontController {
  /**
   * Universal Marketplace Search (Stores & Products with subscription tier ranking boost)
   */
  static async marketplaceSearch(req: Request, res: Response) {
    try {
      const { q, query, category, minPrice, maxPrice, inStockOnly, type = 'all' } = req.query;

      const rawQuery = (q || query) as string | undefined;
      const queryStr = rawQuery ? rawQuery.trim() : undefined;
      const categoryStr = category ? (category as string).trim() : undefined;
      const minP = minPrice ? parseFloat(minPrice as string) : undefined;
      const maxP = maxPrice ? parseFloat(maxPrice as string) : undefined;
      const inStock = inStockOnly === 'true';

      let stores: any[] = [];
      let products: any[] = [];

      if (type === 'all' || type === 'stores') {
        stores = await SearchService.searchStores(queryStr, categoryStr);
      }

      if (type === 'all' || type === 'products') {
        products = await SearchService.searchProducts(queryStr, categoryStr, minP, maxP, inStock);
      }

      return res.json({
        success: true,
        query: queryStr || null,
        counts: {
          stores: stores.length,
          products: products.length,
        },
        stores,
        products,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Store Details for Storefront Page (by Subdomain or Slug)
   */
  static async getStorefrontData(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const isNumeric = /^\d+$/.test(slug);

      const store = await prisma.store.findFirst({
        where: isNumeric ? { id: parseInt(slug, 10) } : { slug: slug.toLowerCase() },
        include: {
          bankAccounts: {
            where: { isActive: true },
            select: {
              id: true,
              bankName: true,
              accountName: true,
              accountNumber: true,
              instructions: true,
              qrCodeUrl: true,
            },
          },
          storeReviews: {
            where: { isApproved: true },
            select: { rating: true },
          },
          plan: {
            select: {
              name: true,
              searchRankBoost: true,
            },
          },
        },
      });

      if (!store) {
        return res.status(404).json({ success: false, message: `Store with slug '${slug}' not found.` });
      }

      // Hard takedown / Soft lock if store is suspended
      if (store.status === StoreStatus.SUSPENDED) {
        return res.status(403).json({
          success: false,
          code: 'STORE_SUSPENDED',
          message: 'This storefront is currently suspended due to lapsed subscription.',
          store: {
            name: store.name,
            logoUrl: store.logoUrl,
            status: store.status,
          },
        });
      }

      const categories = await prisma.productCategory.findMany({
        where: { storeId: store.id },
      });

      const totalReviews = store.storeReviews.length;
      const avgRating = totalReviews > 0
        ? store.storeReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 5.0;

      const { storeReviews, ...storeData } = store;

      return res.json({
        success: true,
        store: {
          ...storeData,
          chapaSecretKey: undefined,
          hasChapaConfigured: Boolean(store.chapaPublicKey && store.chapaSecretKey),
          avgRating: Math.round(avgRating * 10) / 10,
          reviewCount: totalReviews,
        },
        categories,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Public Bank Accounts for a Store
   */
  static async getStoreBankAccounts(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const isNumeric = /^\d+$/.test(slug);

      const store = await prisma.store.findFirst({
        where: isNumeric ? { id: parseInt(slug, 10) } : { slug: slug.toLowerCase() },
        select: {
          id: true,
          name: true,
          bankAccounts: {
            where: { isActive: true },
          },
        },
      });

      if (!store) return res.status(404).json({ success: false, message: 'Store not found' });

      return res.json({
        success: true,
        storeName: store.name,
        bankAccounts: store.bankAccounts,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Product Catalog for Storefront Page
   */
  static async getCatalog(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const { category, search, minPrice, maxPrice, inStockOnly } = req.query;

      const store = await prisma.store.findUnique({
        where: { slug: slug.toLowerCase() },
        select: { id: true, status: true, hideOutOfStock: true },
      });

      if (!store || store.status === StoreStatus.SUSPENDED) {
        return res.status(403).json({ success: false, message: 'Store unavailable or suspended.' });
      }

      const whereClause: any = {
        storeId: store.id,
        isActive: true,
      };

      // Auto-hide out of stock products if setting enabled or query requested
      if (store.hideOutOfStock || inStockOnly === 'true') {
        whereClause.stockQuantity = { gt: 0 };
      }

      if (category) {
        const cat = await prisma.productCategory.findFirst({
          where: { storeId: store.id, slug: category as string },
        });
        if (cat) whereClause.categoryId = cat.id;
      }

      if (search) {
        whereClause.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (minPrice || maxPrice) {
        whereClause.sellingPrice = {};
        if (minPrice) whereClause.sellingPrice.gte = parseFloat(minPrice as string);
        if (maxPrice) whereClause.sellingPrice.lte = parseFloat(maxPrice as string);
      }

      const products = await prisma.product.findMany({
        where: whereClause,
        include: {
          category: true,
          variants: true,
          reviews: { select: { rating: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Calculate average rating
      const formattedProducts = products.map((p) => {
        const totalReviews = p.reviews.length;
        const avgRating = totalReviews > 0 ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 5.0;
        const { reviews, ...rest } = p;
        return {
          ...rest,
          images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images,
          rating: Math.round(avgRating * 10) / 10,
          reviewCount: totalReviews,
        };
      });

      return res.json({ success: true, count: formattedProducts.length, products: formattedProducts });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Product Details + Reviews for Storefront
   */
  static async getProductDetails(req: Request, res: Response) {
    try {
      const { slug, productId } = req.params;

      const store = await prisma.store.findUnique({ where: { slug: slug.toLowerCase() } });
      if (!store) return res.status(404).json({ success: false, message: 'Store not found' });

      const product = await prisma.product.findFirst({
        where: { id: parseInt(productId, 10), storeId: store.id, isActive: true },
        include: {
          category: true,
          variants: true,
          reviews: {
            where: { isApproved: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found in this store.' });
      }

      const totalReviews = product.reviews.length;
      const avgRating = totalReviews > 0 ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 5.0;

      return res.json({
        success: true,
        product: {
          ...product,
          images: typeof product.images === 'string' ? JSON.parse(product.images) : product.images,
          avgRating: Math.round(avgRating * 10) / 10,
          totalReviews,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Add Customer Product Review
   */
  static async addReview(req: Request, res: Response) {
    try {
      const { slug, productId } = req.params;
      const { reviewerName, reviewerEmail, rating, title, comment } = req.body;

      if (!reviewerName || !reviewerEmail || !rating || !comment) {
        return res.status(400).json({ success: false, message: 'Reviewer name, email, rating, and comment are required.' });
      }

      const store = await prisma.store.findUnique({ where: { slug: slug.toLowerCase() } });
      if (!store) return res.status(404).json({ success: false, message: 'Store not found' });

      const pid = parseInt(productId, 10);

      // Check if verified purchase
      let isVerifiedPurchase = false;
      const verifiedOrder = await prisma.order.findFirst({
        where: {
          storeId: store.id,
          customerEmail: reviewerEmail.toLowerCase().trim(),
          status: { in: ['PAID', 'COMPLETED', 'SHIPPED'] },
          items: { some: { productId: pid } },
        },
      });
      if (verifiedOrder) isVerifiedPurchase = true;

      const review = await prisma.review.create({
        data: {
          storeId: store.id,
          productId: pid,
          customerId: req.user ? req.user.id : null,
          reviewerName,
          reviewerEmail: reviewerEmail.toLowerCase().trim(),
          rating: parseInt(rating, 10),
          title,
          comment,
          isVerifiedPurchase,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Product review submitted successfully.',
        review,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Store Reviews for Storefront
   */
  static async getStoreReviews(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const store = await prisma.store.findUnique({ where: { slug: slug.toLowerCase() } });
      if (!store) return res.status(404).json({ success: false, message: 'Store not found' });

      const reviews = await prisma.storeReview.findMany({
        where: { storeId: store.id, isApproved: true },
        orderBy: { createdAt: 'desc' },
      });

      const totalReviews = reviews.length;
      const avgRating = totalReviews > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 5.0;

      return res.json({
        success: true,
        summary: {
          avgRating: Math.round(avgRating * 10) / 10,
          totalReviews,
        },
        reviews,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Add Store Review via Storefront
   */
  static async addStoreReview(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const { reviewerName, reviewerEmail, rating, title, comment } = req.body;

      if (!reviewerName || !reviewerEmail || !rating || !comment) {
        return res.status(400).json({ success: false, message: 'reviewerName, reviewerEmail, rating, and comment are required.' });
      }

      const store = await prisma.store.findUnique({ where: { slug: slug.toLowerCase() } });
      if (!store) return res.status(404).json({ success: false, message: 'Store not found' });

      let isVerifiedPurchase = false;
      const verifiedOrder = await prisma.order.findFirst({
        where: {
          storeId: store.id,
          customerEmail: reviewerEmail.toLowerCase().trim(),
          status: { in: ['PAID', 'COMPLETED', 'SHIPPED'] },
        },
      });
      if (verifiedOrder) isVerifiedPurchase = true;

      const review = await prisma.storeReview.create({
        data: {
          storeId: store.id,
          customerId: req.user ? req.user.id : null,
          reviewerName,
          reviewerEmail: reviewerEmail.toLowerCase().trim(),
          rating: parseInt(rating, 10),
          title,
          comment,
          isVerifiedPurchase,
          isApproved: true,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Store review submitted successfully.',
        review,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
