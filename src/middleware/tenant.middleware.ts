import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { StoreStatus, Role } from '@prisma/client';

export async function tenantIsolation(req: Request, res: Response, next: NextFunction) {
  try {
    let storeIdStr =
      (req.headers['x-store-id'] as string) ||
      (req.query.storeId as string) ||
      (req.params.storeId as string);

    let storeId: number | undefined;

    if (storeIdStr && !isNaN(parseInt(storeIdStr, 10))) {
      storeId = parseInt(storeIdStr, 10);
    } else if (req.user && req.user.storeId) {
      storeId = req.user.storeId;
    }

    if (!storeId) {
      if (req.user && (req.user.role === Role.CUSTOMER || req.user.role === Role.SUPER_ADMIN)) {
        req.storeId = undefined;
        return next();
      }
      return res.status(400).json({
        success: false,
        message: 'Tenant Context Error: Store ID is required in header (x-store-id), query, or authenticated user session.',
      });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, slug: true, status: true, ownerId: true },
    });

    if (!store) {
      if (req.user && req.user.role === Role.CUSTOMER) {
        req.storeId = undefined;
        return next();
      }
      return res.status(404).json({
        success: false,
        message: `Store with ID ${storeId} was not found.`,
      });
    }

    // Verify tenant permission for non-superadmin users
    if (req.user && req.user.role !== Role.SUPER_ADMIN) {
      if (req.user.role === Role.STORE_OWNER) {
        if (store.ownerId !== req.user.id) {
          // Check if owner is also a member of another store
          const membership = await prisma.storeStaffMember.findUnique({
            where: { storeId_userId: { storeId, userId: req.user.id } },
          });
          if (!membership || !membership.isActive) {
            return res.status(403).json({
              success: false,
              message: 'Cross-Tenant Access Forbidden. You do not own or belong to this store.',
            });
          }
        }
      } else if (req.user.role === Role.STORE_STAFF) {
        const membership = await prisma.storeStaffMember.findUnique({
          where: { storeId_userId: { storeId, userId: req.user.id } },
        });

        if (!membership || !membership.isActive) {
          return res.status(403).json({
            success: false,
            message: 'Cross-Tenant Access Forbidden. You are not an active staff member of this store.',
          });
        }

        req.user.staffRole = membership.staffRole;
        try {
          req.user.permissions = JSON.parse(membership.permissions || '[]');
        } catch {
          req.user.permissions = [];
        }
      }
    }

    req.storeId = store.id;
    req.isSuspended = store.status === StoreStatus.SUSPENDED;

    // Soft-lock / Hard takedown check for customer or storefront actions if store is suspended
    const publicPath = req.originalUrl.includes('/storefront') || req.originalUrl.includes('/orders/checkout');
    if (req.isSuspended && publicPath) {
      return res.status(403).json({
        success: false,
        code: 'STORE_SUSPENDED',
        message: 'This store storefront is currently suspended due to lapsed subscription. Please contact store administration.',
      });
    }

    next();
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Tenant resolution error',
      error: error.message,
    });
  }
}
