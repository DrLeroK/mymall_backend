import { prisma } from '../config/db';
import { Role, StaffRole } from '@prisma/client';
import { ApiError } from '../utils/apiError';

export interface TenantAccessContext {
  storeId: number;
  storeName: string;
  isOwner: boolean;
  staffRole?: StaffRole;
  permissions: string[];
}

/**
 * TenantGuardService
 * Provides application-level Row-Level Security (RLS), multi-tenant isolation,
 * and Role-Based Access Control (RBAC) with custom permission overrides.
 */
export class TenantGuardService {
  /**
   * Asserts that a user has legitimate access to a specific tenant (store).
   * Prevents any cross-tenant data leakage or tampering.
   */
  static async assertTenantAccess(userId: number, userRole: Role, storeId: number): Promise<TenantAccessContext> {
    if (!storeId || isNaN(storeId)) {
      throw new ApiError(400, 'Invalid Store ID specified for tenant verification.');
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, ownerId: true, status: true },
    });

    if (!store) {
      throw new ApiError(404, `Store with ID ${storeId} not found.`);
    }

    // Super Admin has global platform oversight
    if (userRole === Role.SUPER_ADMIN) {
      return {
        storeId: store.id,
        storeName: store.name,
        isOwner: true,
        permissions: ['*'],
      };
    }

    // Direct Store Owner
    if (store.ownerId === userId) {
      return {
        storeId: store.id,
        storeName: store.name,
        isOwner: true,
        permissions: ['*'],
      };
    }

    // Check StoreStaffMember junction membership for multi-store staff
    const membership = await prisma.storeStaffMember.findUnique({
      where: { storeId_userId: { storeId, userId } },
    });

    if (!membership || !membership.isActive) {
      throw new ApiError(403, 'Cross-Tenant Access Forbidden: You do not own or belong to this store.');
    }

    let parsedPermissions: string[] = [];
    try {
      parsedPermissions = JSON.parse(membership.permissions || '[]');
    } catch {
      parsedPermissions = [];
    }

    return {
      storeId: store.id,
      storeName: store.name,
      isOwner: false,
      staffRole: membership.staffRole,
      permissions: parsedPermissions,
    };
  }

  /**
   * Asserts that the authenticated staff member has the required role OR
   * a custom permission override explicitly granted by the store owner.
   */
  static assertPermission(
    context: TenantAccessContext,
    requiredRoles: StaffRole[],
    permissionKey?: string
  ): boolean {
    if (context.isOwner) {
      return true; // Store owners have unrestricted rights in their store
    }

    if (context.staffRole && requiredRoles.includes(context.staffRole)) {
      return true;
    }

    if (permissionKey && context.permissions.includes(permissionKey)) {
      return true; // Custom permission override granted by store owner
    }

    throw new ApiError(
      403,
      `Permission Denied: Requires role [${requiredRoles.join(', ')}] or custom permission [${permissionKey || 'none'}].`
    );
  }

  /**
   * Builds an RLS-scoped Prisma query filter to ensure zero cross-tenant leakage.
   */
  static scopedFilter<T extends Record<string, any>>(storeId: number, baseFilter?: T): T & { storeId: number } {
    return {
      ...(baseFilter || ({} as T)),
      storeId,
    };
  }

  /**
   * Validates that an entity belongs to the tenant before allowing mutation or deletion.
   */
  static assertEntityBelongsToTenant(entityStoreId: number | null | undefined, tenantStoreId: number, entityType = 'Resource'): void {
    if (entityStoreId !== tenantStoreId) {
      throw new ApiError(403, `RLS Violation: ${entityType} does not belong to the active store context (${tenantStoreId}).`);
    }
  }
}
