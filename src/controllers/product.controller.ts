import { Request, Response } from "express";
import { prisma } from "../config/db";
import { ProductService, ProductServiceError } from "../services/productService";
import { StorageService } from "../services/storageService";
import { parseCSVProducts, generateProductsCSV } from "../utils/csv";
import { notifyStore } from "../sockets/socket";

export class ProductController {
  /**
   * List Products for Store Admin
   */
  static async getProducts(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { categoryId, search, isActive, page: pageQuery, limit: limitQuery } = req.query;

      const whereClause: any = { storeId };
      if (categoryId) whereClause.categoryId = parseInt(categoryId as string, 10);
      if (isActive !== undefined) whereClause.isActive = isActive === "true";
      if (search) {
        whereClause.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { sku: { contains: search as string, mode: "insensitive" } },
          { barcode: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const total = await prisma.product.count({ where: whereClause });

      const page = pageQuery ? Math.max(1, parseInt(pageQuery as string, 10)) : undefined;
      const isUnlimited = limitQuery === 'all' || limitQuery === '0';
      const limit = isUnlimited
        ? undefined
        : limitQuery
          ? Math.max(1, parseInt(limitQuery as string, 10))
          : (page ? 12 : undefined);

      const findArgs: any = {
        where: whereClause,
        include: { category: true, variants: true },
        orderBy: { createdAt: "desc" },
      };

      if (page && limit) {
        findArgs.skip = (page - 1) * limit;
        findArgs.take = limit;
      }

      const products = await prisma.product.findMany(findArgs);

      return res.json({
        success: true,
        count: products.length,
        total,
        page: page || 1,
        totalPages: limit ? Math.ceil(total / limit) : 1,
        limit: limit || total,
        products,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Single Product By ID for Store Admin
   */
  static async getProductById(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const productId = parseInt(req.params.id, 10);
      const product = await prisma.product.findFirst({
        where: { id: productId, storeId },
        include: { category: true, variants: true },
      });
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found.' });
      }
      return res.json({ success: true, product });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create Product + Variants (Plan Limit Enforced)
   */
  static async createProduct(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const {
        name,
        categoryId,
        description,
        sku,
        barcode,
        brand,
        costPrice,
        sellingPrice,
        compareAtPrice,
        stockQuantity,
        lowStockThreshold,
        unit,
        hasVariants,
        isOnlineVisible,
        variants = [],
        images,
      } = req.body;

      if (!name || sellingPrice === undefined) {
        return res.status(400).json({ success: false, message: "Product name and sellingPrice are required." });
      }

      // Handle Image uploads via StorageService (Cloudflare R2 or local disk fallback)
      const files = req.files as Express.Multer.File[] | undefined;
      let imageUrls: string[] = [];
      if (files && files.length > 0) {
        imageUrls = await StorageService.uploadMultipleFiles(files, "products");
      }
      if (req.body.imageUrls) {
        const extraUrls = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : [req.body.imageUrls];
        imageUrls.push(...extraUrls);
      }
      if (images) {
        try {
          const parsed = typeof images === "string" ? JSON.parse(images) : images;
          if (Array.isArray(parsed)) {
            imageUrls.push(...parsed);
          } else if (typeof parsed === "string") {
            imageUrls.push(parsed);
          }
        } catch {
          imageUrls.push(images);
        }
      }

      // Remove duplicates and empty strings
      imageUrls = Array.from(new Set(imageUrls.map((u) => String(u || '').trim()).filter(Boolean)));

      const parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;

      const product = await ProductService.createProduct(storeId, {
        name,
        categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
        description,
        brand: brand ? String(brand).trim() : undefined,
        sku,
        barcode,
        costPrice: costPrice !== undefined ? parseFloat(costPrice) : 0,
        sellingPrice: parseFloat(sellingPrice),
        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : undefined,
        stockQuantity: stockQuantity !== undefined ? parseFloat(stockQuantity) : 0,
        lowStockThreshold: lowStockThreshold !== undefined ? parseFloat(lowStockThreshold) : 5,
        unit: unit || "pcs",
        images: imageUrls,
        hasVariants: Boolean(hasVariants) || (Array.isArray(parsedVariants) && parsedVariants.length > 0),
        isOnlineVisible: isOnlineVisible !== undefined ? (isOnlineVisible === "true" || isOnlineVisible === true) : true,
        variants: parsedVariants,
      });

      notifyStore(storeId, "product:created", { product });

      return res.status(201).json({ success: true, message: "Product created successfully", product });
    } catch (error: any) {
      if (error instanceof ProductServiceError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
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
      const {
        name,
        categoryId,
        description,
        brand,
        sku,
        barcode,
        costPrice,
        sellingPrice,
        compareAtPrice,
        stockQuantity,
        lowStockThreshold,
        unit,
        isActive,
        isOnlineVisible,
        variants,
        images,
      } = req.body;

      // Handle newly uploaded images if any
      const files = req.files as Express.Multer.File[] | undefined;
      let newImageUrls: string[] | undefined = undefined;
      if (files && files.length > 0) {
        newImageUrls = await StorageService.uploadMultipleFiles(files, "products");
      }
      if (req.body.imageUrls) {
        const extraUrls = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : [req.body.imageUrls];
        newImageUrls = [...(newImageUrls || []), ...extraUrls];
      }
      if (images !== undefined) {
        try {
          const parsed = typeof images === "string" ? JSON.parse(images) : images;
          if (Array.isArray(parsed)) {
            newImageUrls = [...(newImageUrls || []), ...parsed];
          } else if (typeof parsed === "string") {
            newImageUrls = [...(newImageUrls || []), parsed];
          }
        } catch {
          newImageUrls = [...(newImageUrls || []), images];
        }
      }

      if (newImageUrls) {
        newImageUrls = Array.from(new Set(newImageUrls.map((u) => String(u || '').trim()).filter(Boolean)));
      }

      const parsedVariants = variants ? (typeof variants === "string" ? JSON.parse(variants) : variants) : undefined;

      const updated = await ProductService.updateProduct(productId, storeId, {
        name,
        categoryId: categoryId !== undefined ? (categoryId ? parseInt(categoryId, 10) : undefined) : undefined,
        description,
        brand: brand !== undefined ? (brand ? String(brand).trim() : null) as any : undefined,
        sku,
        barcode,
        costPrice: costPrice !== undefined ? parseFloat(costPrice) : undefined,
        sellingPrice: sellingPrice !== undefined ? parseFloat(sellingPrice) : undefined,
        compareAtPrice: compareAtPrice !== undefined ? parseFloat(compareAtPrice) : undefined,
        stockQuantity: stockQuantity !== undefined ? parseFloat(stockQuantity) : undefined,
        lowStockThreshold: lowStockThreshold !== undefined ? parseFloat(lowStockThreshold) : undefined,
        unit,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        isOnlineVisible: isOnlineVisible !== undefined ? (isOnlineVisible === "true" || isOnlineVisible === true) : undefined,
        images: newImageUrls,
        variants: parsedVariants,
      });

      notifyStore(storeId, "product:updated", { product: updated });
      return res.json({ success: true, message: "Product updated successfully", product: updated });
    } catch (error: any) {
      if (error instanceof ProductServiceError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
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

      const result = await ProductService.deleteProduct(productId, storeId);
      return res.json(result);
    } catch (error: any) {
      if (error instanceof ProductServiceError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
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
        return res.status(400).json({ success: false, message: "csvText content string is required." });
      }

      const records = parseCSVProducts(csvText);
      if (records.length === 0) {
        return res.status(400).json({ success: false, message: "No valid product rows parsed from CSV." });
      }

      let createdCount = 0;
      for (const rec of records) {
        await ProductService.createProduct(storeId, {
          name: rec.name,
          description: rec.description,
          sku: rec.sku,
          barcode: rec.barcode,
          costPrice: rec.costPrice || 0,
          sellingPrice: rec.sellingPrice,
          stockQuantity: rec.stockQuantity || 0,
          lowStockThreshold: rec.lowStockThreshold || 5,
          unit: rec.unit || "pcs",
        });
        createdCount++;
      }

      return res.json({
        success: true,
        message: "Successfully imported " + createdCount + " products from CSV.",
      });
    } catch (error: any) {
      if (error instanceof ProductServiceError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
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
      const { name, description, imageUrl } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, message: "Category name is required." });
      }
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const category = await prisma.productCategory.create({
        data: { storeId, name, slug, description: description || null, imageUrl: imageUrl || null },
        include: { _count: { select: { products: true } } },
      });
      return res.status(201).json({ success: true, category });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateCategory(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const categoryId = parseInt(req.params.id, 10);
      const { name, description, imageUrl } = req.body;

      const existing = await prisma.productCategory.findFirst({
        where: { id: categoryId, storeId },
      });

      if (!existing) {
        return res.status(404).json({ success: false, message: "Category not found or does not belong to your store." });
      }

      const slug = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : undefined;

      const updated = await prisma.productCategory.update({
        where: { id: categoryId },
        data: {
          ...(name && { name, slug }),
          ...(description !== undefined && { description: description || null }),
          ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
        },
        include: { _count: { select: { products: true } } },
      });

      return res.json({ success: true, message: "Category updated successfully.", category: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteCategory(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const categoryId = parseInt(req.params.id, 10);

      const existing = await prisma.productCategory.findFirst({
        where: { id: categoryId, storeId },
      });

      if (!existing) {
        return res.status(404).json({ success: false, message: "Category not found or does not belong to your store." });
      }

      // Disassociate products from this category safely without deleting products
      await prisma.product.updateMany({
        where: { storeId, categoryId },
        data: { categoryId: null },
      });

      await prisma.productCategory.delete({
        where: { id: categoryId },
      });

      return res.json({ success: true, message: "Category deleted successfully. Associated products set to Uncategorized." });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Dedicated single product or branding image upload endpoint
   */
  static async uploadImage(req: Request, res: Response) {
    try {
      const file = req.file || (req.files && Array.isArray(req.files) ? req.files[0] : undefined);
      if (!file) {
        return res.status(400).json({ success: false, message: "No image file provided." });
      }
      const folder = (req.body?.folder as any) || 'products';
      const imageUrl = await StorageService.uploadFile(file, folder);
      return res.status(201).json({
        success: true,
        url: imageUrl,
        filename: file.filename || file.originalname,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Inventory Pricing Report: Selling vs Buying (Cost) Prices, Margins, and Valuations
   */
  static async getInventoryPricing(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const products = await prisma.product.findMany({
        where: { storeId },
        include: {
          category: true,
          variants: true,
        },
        orderBy: { name: 'asc' },
      });

      const pricingItems = products.map((product) => {
        const costPrice = Number(product.costPrice || 0);
        const sellingPrice = Number(product.sellingPrice || 0);
        const marginEtb = Math.max(0, sellingPrice - costPrice);
        const marginPercent = sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0;
        const totalStock = product.hasVariants && product.variants.length > 0
          ? product.variants.reduce((acc, v) => acc + (v.stockQuantity || 0), 0)
          : Number(product.stockQuantity || 0);
        const inventoryCostValue = totalStock * costPrice;
        const inventoryRetailValue = totalStock * sellingPrice;

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          barcode: product.barcode,
          categoryName: product.category?.name || 'Uncategorized',
          costPrice,
          sellingPrice,
          compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
          marginEtb: Number(marginEtb.toFixed(2)),
          marginPercent: Number(marginPercent.toFixed(1)),
          stockQuantity: totalStock,
          inventoryCostValue: Number(inventoryCostValue.toFixed(2)),
          inventoryRetailValue: Number(inventoryRetailValue.toFixed(2)),
          variants: product.variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            price: v.price ? Number(v.price) : sellingPrice,
            stockQuantity: v.stockQuantity,
          })),
        };
      });

      const totalValuationAtCost = pricingItems.reduce((acc, p) => acc + p.inventoryCostValue, 0);
      const totalValuationAtRetail = pricingItems.reduce((acc, p) => acc + p.inventoryRetailValue, 0);
      const totalStockCount = pricingItems.reduce((acc, p) => acc + p.stockQuantity, 0);

      return res.json({
        success: true,
        items: pricingItems,
        summary: {
          totalProducts: pricingItems.length,
          totalStockCount,
          totalValuationAtCost: Number(totalValuationAtCost.toFixed(2)),
          totalValuationAtRetail: Number(totalValuationAtRetail.toFixed(2)),
          potentialProfit: Number((totalValuationAtRetail - totalValuationAtCost).toFixed(2)),
        },
      });
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
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=products_store_" + storeId + ".csv");
      return res.send(csvString);
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
