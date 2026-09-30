import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Role } from '@prisma/client';

export class ReviewController {
  // ==========================================
  // 1. SITE-LEVEL REVIEWS & RATINGS
  // ==========================================

  /**
   * Submit Site-level Review / Testimonial
   */
  static async createSiteReview(req: Request, res: Response) {
    try {
      const { reviewerName, reviewerEmail, rating, title, comment } = req.body;
      const userId = req.user ? req.user.id : null;

      if (!reviewerName || !reviewerEmail || !rating || !comment) {
        return res.status(400).json({ success: false, message: 'reviewerName, reviewerEmail, rating, and comment are required.' });
      }

      const numRating = parseInt(rating, 10);
      if (numRating < 1 || numRating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
      }

      const review = await prisma.siteReview.create({
        data: {
          userId,
          reviewerName,
          reviewerEmail: reviewerEmail.toLowerCase().trim(),
          rating: numRating,
          title,
          comment,
          isApproved: true,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Thank you! Your platform review has been submitted.',
        review,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Approved Site Reviews with Rating Summary
   */
  static async getSiteReviews(req: Request, res: Response) {
    try {
      const reviews = await prisma.siteReview.findMany({
        where: { isApproved: true },
        orderBy: { createdAt: 'desc' },
      });

      const totalReviews = reviews.length;
      const avgRating = totalReviews > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 5.0;

      // Rating distribution breakdown (1-5 stars)
      const distribution: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      reviews.forEach((r) => {
        if (distribution[r.rating] !== undefined) distribution[r.rating]++;
      });

      return res.json({
        success: true,
        summary: {
          avgRating: Math.round(avgRating * 10) / 10,
          totalReviews,
          distribution,
        },
        reviews,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Moderate Site Review (Super Admin)
   */
  static async moderateSiteReview(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      const { isApproved } = req.body;

      const review = await prisma.siteReview.update({
        where: { id },
        data: { isApproved: Boolean(isApproved) },
      });

      return res.json({ success: true, message: 'Review moderation updated.', review });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // 2. STORE-LEVEL REVIEWS & RATINGS
  // ==========================================

  /**
   * Submit Store Review
   */
  static async createStoreReview(req: Request, res: Response) {
    try {
      const storeId = parseInt(req.params.storeId, 10);
      const { reviewerName, reviewerEmail, rating, title, comment } = req.body;
      const customerId = req.user ? req.user.id : null;

      if (!reviewerName || !reviewerEmail || !rating || !comment) {
        return res.status(400).json({ success: false, message: 'reviewerName, reviewerEmail, rating, and comment are required.' });
      }

      const numRating = parseInt(rating, 10);
      if (numRating < 1 || numRating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
      }

      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) return res.status(404).json({ success: false, message: 'Store not found.' });

      // Check if verified purchase from this store
      let isVerifiedPurchase = false;
      const verifiedOrder = await prisma.order.findFirst({
        where: {
          storeId,
          customerEmail: reviewerEmail.toLowerCase().trim(),
          status: { in: ['PAID', 'COMPLETED', 'SHIPPED'] },
        },
      });
      if (verifiedOrder) isVerifiedPurchase = true;

      const review = await prisma.storeReview.create({
        data: {
          storeId,
          customerId,
          reviewerName,
          reviewerEmail: reviewerEmail.toLowerCase().trim(),
          rating: numRating,
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

  /**
   * Get Store Reviews with Summary
   */
  static async getStoreReviews(req: Request, res: Response) {
    try {
      const storeId = parseInt(req.params.storeId, 10);
      const reviews = await prisma.storeReview.findMany({
        where: { storeId, isApproved: true },
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
   * Moderate Store Review (Store Owner or Super Admin)
   */
  static async moderateStoreReview(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      const { isApproved } = req.body;

      const review = await prisma.storeReview.findUnique({ where: { id } });
      if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

      if (req.user?.role !== Role.SUPER_ADMIN && req.storeId !== review.storeId) {
        return res.status(403).json({ success: false, message: 'Unauthorized to moderate this review.' });
      }

      const updated = await prisma.storeReview.update({
        where: { id },
        data: { isApproved: Boolean(isApproved) },
      });

      return res.json({ success: true, message: 'Store review moderation updated.', review: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // 3. PRODUCT-LEVEL REVIEWS & RATINGS
  // ==========================================

  /**
   * Submit Product Review
   */
  static async createProductReview(req: Request, res: Response) {
    try {
      const productId = parseInt(req.params.productId, 10);
      const { reviewerName, reviewerEmail, rating, title, comment } = req.body;
      const customerId = req.user ? req.user.id : null;

      if (!reviewerName || !reviewerEmail || !rating || !comment) {
        return res.status(400).json({ success: false, message: 'reviewerName, reviewerEmail, rating, and comment are required.' });
      }

      const numRating = parseInt(rating, 10);
      if (numRating < 1 || numRating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
      }

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

      // Check if verified purchase
      let isVerifiedPurchase = false;
      const verifiedOrder = await prisma.order.findFirst({
        where: {
          storeId: product.storeId,
          customerEmail: reviewerEmail.toLowerCase().trim(),
          status: { in: ['PAID', 'COMPLETED', 'SHIPPED'] },
          items: { some: { productId } },
        },
      });
      if (verifiedOrder) isVerifiedPurchase = true;

      const review = await prisma.review.create({
        data: {
          storeId: product.storeId,
          productId,
          customerId,
          reviewerName,
          reviewerEmail: reviewerEmail.toLowerCase().trim(),
          rating: numRating,
          title,
          comment,
          isVerifiedPurchase,
          isApproved: true,
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
   * Get Product Reviews
   */
  static async getProductReviews(req: Request, res: Response) {
    try {
      const productId = parseInt(req.params.productId, 10);
      const reviews = await prisma.review.findMany({
        where: { productId, isApproved: true },
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
}
