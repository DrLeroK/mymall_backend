import { prisma } from '../config/db';
import { StoreStatus } from '@prisma/client';

export class SearchService {
  /**
   * Search all stores in the marketplace with rank boosting from subscription tiers
   */
  static async searchStores(query?: string, category?: string, limit: number = 20, offset: number = 0) {
    const whereClause: any = {
      status: StoreStatus.ACTIVE,
    };

    if (query) {
      whereClause.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
        { address: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (category) {
      whereClause.category = { contains: category, mode: 'insensitive' };
    }

    const stores = await prisma.store.findMany({
      where: whereClause,
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            searchRankBoost: true,
          },
        },
        storeReviews: {
          where: { isApproved: true },
          select: { rating: true },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
      take: limit,
      skip: offset,
    });

    // Rank stores: Boost by plan.searchRankBoost descending, then by average rating
    const rankedStores = stores.map((store) => {
      const totalReviews = store.storeReviews.length;
      const avgRating = totalReviews > 0
        ? store.storeReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 5.0;

      const rankBoost = store.plan?.searchRankBoost || 1;

      return {
        id: store.id,
        name: store.name,
        slug: store.slug,
        tagline: store.tagline,
        description: store.description,
        category: store.category,
        logoUrl: store.logoUrl,
        bannerUrl: store.bannerUrl,
        address: store.address,
        currency: store.currency,
        tierName: store.plan?.name || 'Free',
        searchRankBoost: rankBoost,
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount: totalReviews,
        productCount: store._count.products,
      };
    });

    rankedStores.sort((a, b) => {
      if (b.searchRankBoost !== a.searchRankBoost) {
        return b.searchRankBoost - a.searchRankBoost;
      }
      return b.avgRating - a.avgRating;
    });

    return rankedStores;
  }

  /**
   * Search all products in the marketplace with rank boosting by store subscription tier
   */
  static async searchProducts(query?: string, categorySlug?: string, minPrice?: number, maxPrice?: number, inStockOnly: boolean = false, limit: number = 30, offset: number = 0) {
    const whereClause: any = {
      isActive: true,
      store: {
        status: StoreStatus.ACTIVE,
      },
    };

    if (query) {
      whereClause.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (categorySlug) {
      whereClause.category = { slug: categorySlug };
    }

    if (inStockOnly) {
      whereClause.stockQuantity = { gt: 0 };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      whereClause.sellingPrice = {};
      if (minPrice !== undefined) whereClause.sellingPrice.gte = minPrice;
      if (maxPrice !== undefined) whereClause.sellingPrice.lte = maxPrice;
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        category: true,
        variants: true,
        reviews: {
          where: { isApproved: true },
          select: { rating: true },
        },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            currency: true,
            logoUrl: true,
            plan: {
              select: {
                id: true,
                name: true,
                searchRankBoost: true,
              },
            },
          },
        },
      },
      take: limit,
      skip: offset,
    });

    const rankedProducts = products.map((p) => {
      const totalReviews = p.reviews.length;
      const avgRating = totalReviews > 0
        ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 5.0;

      const rankBoost = p.store.plan?.searchRankBoost || 1;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        sellingPrice: p.sellingPrice,
        compareAtPrice: p.compareAtPrice,
        stockQuantity: p.stockQuantity,
        unit: p.unit,
        images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images,
        hasVariants: p.hasVariants,
        variants: p.variants,
        category: p.category,
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount: totalReviews,
        store: {
          id: p.store.id,
          name: p.store.name,
          slug: p.store.slug,
          currency: p.store.currency,
          logoUrl: p.store.logoUrl,
          tierName: p.store.plan?.name || 'Free',
          searchRankBoost: rankBoost,
        },
      };
    });

    rankedProducts.sort((a, b) => {
      if (b.store.searchRankBoost !== a.store.searchRankBoost) {
        return b.store.searchRankBoost - a.store.searchRankBoost;
      }
      return b.avgRating - a.avgRating;
    });

    return rankedProducts;
  }
}
