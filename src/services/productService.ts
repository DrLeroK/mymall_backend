import { prisma } from '../config/db';

export class ProductServiceError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = 'ProductServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface VariantInput {
  id?: number;
  name: string;
  sku?: string;
  barcode?: string;
  price?: number;
  stockQuantity: number;
  options?: Record<string, any> | string;
}

export interface CreateProductInput {
  categoryId?: number;
  name: string;
  slug?: string;
  brand?: string;
  description?: string;
  sku?: string;
  barcode?: string;
  costPrice?: number;
  sellingPrice: number;
  compareAtPrice?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  unit?: string;
  images?: string[];
  isActive?: boolean;
  isOnlineVisible?: boolean;
  hasVariants?: boolean;
  variants?: VariantInput[];
}

export class ProductService {
  static async createProduct(storeId: number, data: CreateProductInput) {
    // 1. Subscription Plan Limit Enforcement
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { plan: true },
    });

    if (!store) {
      throw new ProductServiceError('Store not found.', 404);
    }

    if (store.plan) {
      const currentProductCount = await prisma.product.count({ where: { storeId } });
      if (currentProductCount >= store.plan.maxProducts) {
        throw new ProductServiceError(
          'Your subscription plan is full. You have reached the maximum product limit (' + store.plan.maxProducts + ') for your plan. Please upgrade your subscription.',
          403,
          'PLAN_LIMIT_REACHED'
        );
      }
    }

    // 2. Generate slug
    const baseSlug = (data.slug || data.name).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    let uniqueSlug = baseSlug;
    let counter = 1;
    while (await prisma.product.findUnique({ where: { storeId_slug: { storeId, slug: uniqueSlug } } })) {
      uniqueSlug = `${baseSlug}-${counter++}`;
    }

    const hasVariants = !!(data.variants && data.variants.length > 0);
    const totalStock = hasVariants
      ? data.variants!.reduce((sum, v) => sum + (Number(v.stockQuantity) || 0), 0)
      : (data.stockQuantity || 0);

    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId: data.categoryId || null,
        name: data.name,
        slug: uniqueSlug,
        brand: data.brand || null,
        description: data.description,
        sku: data.sku,
        barcode: data.barcode,
        costPrice: data.costPrice || 0,
        sellingPrice: data.sellingPrice,
        compareAtPrice: data.compareAtPrice,
        stockQuantity: totalStock,
        lowStockThreshold: data.lowStockThreshold || 5,
        unit: data.unit || 'pcs',
        images: JSON.stringify(data.images || []),
        isActive: data.isActive !== undefined ? data.isActive : true,
        isOnlineVisible: data.isOnlineVisible !== undefined ? data.isOnlineVisible : true,
        hasVariants,
      },
    });

    // 3. Create Variants if provided
    if (hasVariants && data.variants && data.variants.length > 0) {
      await prisma.productVariant.createMany({
        data: data.variants.map((v) => ({
          productId: product.id,
          name: v.name,
          sku: v.sku || null,
          barcode: v.barcode || null,
          price: v.price !== undefined ? v.price : data.sellingPrice,
          stockQuantity: v.stockQuantity || 0,
          options: typeof v.options === 'string' ? v.options : JSON.stringify(v.options || {}),
        })),
      });
    }

    return prisma.product.findUnique({
      where: { id: product.id },
      include: {
        category: true,
        variants: true,
      },
    });
  }

  static async updateProduct(productId: number, storeId: number, data: Partial<CreateProductInput>) {
    const existing = await prisma.product.findFirst({
      where: { id: productId, storeId },
    });
    if (!existing) {
      throw new ProductServiceError('Product not found in this store.', 404);
    }

    const hasVariants = data.variants !== undefined
      ? data.variants.length > 0
      : existing.hasVariants;

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        categoryId: data.categoryId !== undefined ? data.categoryId : undefined,
        name: data.name,
        brand: data.brand !== undefined ? data.brand : undefined,
        description: data.description,
        sku: data.sku,
        barcode: data.barcode,
        costPrice: data.costPrice !== undefined ? data.costPrice : undefined,
        sellingPrice: data.sellingPrice !== undefined ? data.sellingPrice : undefined,
        compareAtPrice: data.compareAtPrice !== undefined ? data.compareAtPrice : undefined,
        stockQuantity: data.stockQuantity !== undefined ? data.stockQuantity : undefined,
        lowStockThreshold: data.lowStockThreshold !== undefined ? data.lowStockThreshold : undefined,
        unit: data.unit,
        images: data.images ? JSON.stringify(data.images) : undefined,
        isActive: data.isActive !== undefined ? data.isActive : undefined,
        isOnlineVisible: data.isOnlineVisible !== undefined ? data.isOnlineVisible : undefined,
        hasVariants,
      },
    });

    // Replace variants if array provided
    if (data.variants !== undefined) {
      await prisma.productVariant.deleteMany({ where: { productId } });
      if (data.variants.length > 0) {
        await prisma.productVariant.createMany({
          data: data.variants.map((v) => ({
            productId,
            name: v.name,
            sku: v.sku || null,
            barcode: v.barcode || null,
            price: v.price !== undefined ? v.price : updated.sellingPrice,
            stockQuantity: v.stockQuantity || 0,
            options: typeof v.options === 'string' ? v.options : JSON.stringify(v.options || {}),
          })),
        });
      }
    }

    return prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, variants: true },
    });
  }

  static async deleteProduct(productId: number, storeId: number) {
    const existing = await prisma.product.findFirst({
      where: { id: productId, storeId },
    });
    if (!existing) {
      throw new ProductServiceError('Product not found in this store.', 404);
    }
    await prisma.product.delete({ where: { id: productId } });
    return { success: true, message: 'Product successfully deleted.' };
  }

  static async getProductById(productId: number, storeId?: number) {
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        ...(storeId ? { storeId } : {}),
      },
      include: { category: true, variants: true, reviews: { where: { isApproved: true } } },
    });
    if (!product) {
      throw new ProductServiceError('Product not found.', 404);
    }
    return product;
  }
}
