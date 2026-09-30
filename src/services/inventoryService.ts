import { prisma } from '../config/db';
import { AlertType } from '@prisma/client';
import { notifyStore, notifyStorefront } from '../sockets/socket';

export class InventoryService {
  /**
   * Decrement stock quantity for a product and optional variant atomically.
   * Auto-triggers low-stock alert and Socket.io real-time broadcast.
   */
  static async decrementStock(
    tx: any,
    storeId: number,
    productId: number,
    quantity: number,
    variantId?: number | null
  ): Promise<any> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { store: true },
    });

    if (!product) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    if (product.stockQuantity < quantity) {
      throw new Error(`Insufficient stock for product '${product.name}'. Available: ${product.stockQuantity}, Requested: ${quantity}`);
    }

    const newProductStock = product.stockQuantity - quantity;

    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: newProductStock },
    });

    let updatedVariant = null;

    if (variantId) {
      const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
      if (variant) {
        if (variant.stockQuantity < quantity) {
          throw new Error(`Insufficient stock for variant '${variant.name}'. Available: ${variant.stockQuantity}`);
        }
        updatedVariant = await tx.productVariant.update({
          where: { id: variantId },
          data: { stockQuantity: variant.stockQuantity - quantity },
        });
      }
    }

    // Low stock alert check
    if (newProductStock <= product.lowStockThreshold) {
      await tx.alert.create({
        data: {
          storeId,
          productId,
          type: AlertType.LOW_STOCK,
          title: `Low Stock Alert: ${product.name}`,
          message: `Product '${product.name}' stock level has fallen to ${newProductStock} ${product.unit}.`,
        },
      });

      notifyStore(storeId, 'alert:low_stock', {
        productId,
        productName: product.name,
        stockQuantity: newProductStock,
        threshold: product.lowStockThreshold,
      });
    }

    // Real-Time Socket.io broadcasts to POS, Store Dashboard, and Storefront clients
    notifyStore(storeId, 'inventory:updated', {
      productId,
      variantId,
      newStockQuantity: newProductStock,
      variantStockQuantity: updatedVariant?.stockQuantity,
    });

    if (product.store?.slug) {
      notifyStorefront(product.store.slug, 'product:stock_changed', {
        productId,
        newStockQuantity: newProductStock,
      });
    }

    return { product: updatedProduct, variant: updatedVariant };
  }

  /**
   * Restore stock quantity (e.g. on order cancellation)
   */
  static async restoreStock(
    tx: any,
    storeId: number,
    productId: number,
    quantity: number,
    variantId?: number | null
  ) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { store: true },
    });

    if (!product) return;

    const newStock = product.stockQuantity + quantity;

    await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: newStock },
    });

    if (variantId) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { stockQuantity: { increment: quantity } },
      });
    }

    notifyStore(storeId, 'inventory:updated', {
      productId,
      variantId,
      newStockQuantity: newStock,
    });
  }
}
