import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { BillingService } from '../services/billingService';
import { parseCSVProducts, generateProductsCSV } from '../utils/csv';
import { notifyStore } from '../sockets/socket';

export class ProductController {
  /**
   * List Products for Store Admin
   */
  static async getProducts(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { categoryId, search, isActive } = req.query;

      const whereClause: any = { storeId };
      if (categoryId) whereClause.categoryId = parseInt(categoryId as string, 10);
      if (isActive !== undefined) whereClause.isActive = isActive === 'true';
      if (search) {
        whereClause.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { sku: { contains: search as string, mode: 'insensitive' } },
          { barcode: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const products = await prisma.product.findMany({
        where: whereClause,
        include: { category: true, variants: true },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, count: products.length, products });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create Product + Variants
   */
  static async createProduct(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;

      // Enforce Plan product limits
      const limitCheck = await BillingService.canAddProduct(storeId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          success: false,
          message: `Product limit reached for your plan. Maximum products allowed: ${limitCheck.maxProducts}. Upgrade subscription to add more products.`,
        });
      }

      const {
        name,
        categoryId,
        description,
        sku,
        barcode,
        costPrice = 0,
        sellingPrice,
        compareAtPrice,
        stockQuantity = 0,
        lowStockThreshold = 5,
        unit = 'pcs',
        hasVariants = false,
        variants = [],
      } = req.body;

      if (!name || sellingPrice === undefined) {
        return res.status(400).json({ success: false, message: 'Product name and sellingPrice are required.' });
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);

      // Handle Image uploads
      const files = req.files as Express.Multer.File[] | undefined;
      const imageUrls: string[] = files ? files.map((f) => `/uploads/products/${f.filename}`) : [];
      if (req.body.imageUrls) {
        const extraUrls = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : [req.body.imageUrls];
        imageUrls.push(...extraUrls);
      }

      const parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;

      const product = await prisma.product.create({
        data: {
          storeId,
          categoryId: categoryId ? parseInt(categoryId, 10) : null,
          name,
          slug,
          description,
          sku,
          barcode,
          costPrice: parseFloat(costPrice),
          sellingPrice: parseFloat(sellingPrice),
          compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
          stockQuantity: parseFloat(stockQuantity),
          lowStockThreshold: parseFloat(lowStockThreshold),
          unit,
          images: JSON.stringify(imageUrls),
          hasVariants: Boolean(hasVariants) || parsedVariants.length > 0,
          variants: {
            create: parsedVariants.map((v: any) => ({
              name: v.name,
              sku: v.sku,
              barcode: v.barcode,
              price: v.price ? parseFloat(v.price) : null,
              stockQuantity: parseFloat(v.stockQuantity || 0),
              options: JSON.stringify(v.options || {}),
            })),
          },
        },
        include: { category: true, variants: true },
      });

      notifyStore(storeId, 'product:created', { product });

      return res.status(201).json({ success: true, message: 'Product created successfully', product });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update Product
   */
  static async updateProduct(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const productId = parseInt(req.params.id, 10);

      const existing = await prisma.product.findFirst({ where: { id: productId, storeId } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      const { name, categoryId, description, sku, barcode, costPrice, sellingPrice, compareAtPrice, stockQuantity, lowStockThreshold, unit, isActive } = req.body;

      const updated = await prisma.product.update({
        where: { id: productId },
        data: {
          ...(name && { name }),
          ...(categoryId !== undefined && { categoryId: categoryId ? parseInt(categoryId, 10) : null }),
          ...(description !== undefined && { description }),
          ...(sku !== undefined && { sku }),
          ...(barcode !== undefined && { barcode }),
          ...(costPrice !== undefined && { costPrice: parseFloat(costPrice) }),
          ...(sellingPrice !== undefined && { sellingPrice: parseFloat(sellingPrice) }),
          ...(compareAtPrice !== undefined && { compareAtPrice: parseFloat(compareAtPrice) }),
          ...(stockQuantity !== undefined && { stockQuantity: parseFloat(stockQuantity) }),
          ...(lowStockThreshold !== undefined && { lowStockThreshold: parseFloat(lowStockThreshold) }),
          ...(unit && { unit }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
        include: { category: true, variants: true },
      });

      notifyStore(storeId, 'product:updated', { product: updated });

      return res.json({ success: true, message: 'Product updated successfully', product: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete Product
   */
  static async deleteProduct(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const productId = parseInt(req.params.id, 10);

      await prisma.product.deleteMany({
        where: { id: productId, storeId },
      });

      return res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * CSV Bulk Import for Merchant Migration
   */
  static async importCSV(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { csvText } = req.body;

      if (!csvText) {
        return res.status(400).json({ success: false, message: 'csvText content string is required.' });
      }

      const records = parseCSVProducts(csvText);
      if (records.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid product rows parsed from CSV.' });
      }

      let createdCount = 0;
      for (const rec of records) {
        const slug = rec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);
        await prisma.product.create({
          data: {
            storeId,
            name: rec.name,
            slug,
            description: rec.description,
            sku: rec.sku,
            barcode: rec.barcode,
            costPrice: rec.costPrice || 0,
            sellingPrice: rec.sellingPrice,
            stockQuantity: rec.stockQuantity || 0,
            lowStockThreshold: rec.lowStockThreshold || 5,
            unit: rec.unit || 'pcs',
          },
        });
        createdCount++;
      }

      return res.json({
        success: true,
        message: `Successfully imported ${createdCount} products from CSV.`,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Product Category CRUD
   */
  static async getCategories(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const categories = await prisma.productCategory.findMany({
        where: { storeId },
        include: { _count: { select: { products: true } } },
      });
      return res.json({ success: true, categories });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async createCategory(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, message: 'Category name is required.' });
      }
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const category = await prisma.productCategory.create({
        data: { storeId, name, slug, description },
      });
      return res.status(201).json({ success: true, category });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Export Products to CSV
   */
  static async exportCSV(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const products = await prisma.product.findMany({
        where: { storeId },
        include: { category: true },
      });

      const csvString = generateProductsCSV(products);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=products_store_${storeId}.csv`);
      return res.send(csvString);
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
