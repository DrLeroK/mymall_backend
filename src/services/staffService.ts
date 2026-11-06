import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db";
import { StaffRole, StaffInviteStatus, Role } from "@prisma/client";
import { generateTokens } from "../utils/jwt";
import { sendStaffInviteEmail } from "./emailService";

export class StaffServiceError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = "StaffServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class StaffService {
  static async inviteStaff(
    storeId: number,
    invitedById: number,
    email: string,
    assignedRole: StaffRole = StaffRole.CASHIER,
    permissions: string[] = []
  ) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { plan: true },
    });

    if (!store) {
      throw new StaffServiceError("Store not found.", 404);
    }

    // 1. Subscription Plan Staff Limit Enforcement
    if (store.plan) {
      const activeStaffCount = await prisma.storeStaffMember.count({
        where: { storeId, isActive: true },
      });
      if (activeStaffCount >= store.plan.maxStaff) {
        throw new StaffServiceError(
          "Your subscription plan is full. You have reached the maximum staff limit (" +
            store.plan.maxStaff +
            ") for your plan. Please upgrade your subscription.",
          403,
          "PLAN_LIMIT_REACHED"
        );
      }
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user is already an active member of this store
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      const existingMember = await prisma.storeStaffMember.findUnique({
        where: { storeId_userId: { storeId, userId: existingUser.id } },
      });
      if (existingMember && existingMember.isActive) {
        throw new StaffServiceError("This user is already an active staff member of this store.", 409);
      }
    }

    // Generate unique 16-character secure invite code
    const inviteCode = "INV-" + crypto.randomBytes(8).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.staffInvite.create({
      data: {
        storeId,
        email: cleanEmail,
        assignedRole,
        permissions: JSON.stringify(permissions),
        inviteCode,
        status: StaffInviteStatus.PENDING,
        invitedById,
        expiresAt,
      },
    });

    try {
      await sendStaffInviteEmail(cleanEmail, store.name, assignedRole, inviteCode);
    } catch (err) {
      console.warn("Could not dispatch invite email via SMTP:", err);
    }

    return invite;
  }

  static async getInviteDetails(inviteCode: string) {
    const invite = await prisma.staffInvite.findUnique({
      where: { inviteCode },
      include: {
        store: { select: { id: true, name: true, slug: true, logoUrl: true } },
        invitedBy: { select: { name: true, email: true } },
      },
    });

    if (!invite) {
      throw new StaffServiceError("Invitation not found or code is invalid.", 404, "INVITE_NOT_FOUND");
    }

    if (invite.status !== StaffInviteStatus.PENDING) {
      throw new StaffServiceError(
        "This invitation has already been " + invite.status.toLowerCase() + ".",
        400,
        "INVITE_USED"
      );
    }

    if (new Date() > invite.expiresAt) {
      await prisma.staffInvite.update({
        where: { id: invite.id },
        data: { status: StaffInviteStatus.EXPIRED },
      });
      throw new StaffServiceError("This invitation has expired.", 400, "INVITE_EXPIRED");
    }

    return invite;
  }

  static async acceptInvite(inviteCode: string, userId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new StaffServiceError("User not found.", 404);
    }

    const invite = await this.getInviteDetails(inviteCode);

    // Verify invitation email matches accepting user email
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new StaffServiceError(
        "This invitation was sent to " +
          invite.email +
          ". You are logged in as " +
          user.email +
          ". Please log in with the invited email address.",
        403,
        "EMAIL_MISMATCH"
      );
    }

    // Add or update StoreStaffMember
    const membership = await prisma.storeStaffMember.upsert({
      where: { storeId_userId: { storeId: invite.storeId, userId: user.id } },
      update: {
        staffRole: invite.assignedRole,
        permissions: invite.permissions,
        isActive: true,
      },
      create: {
        storeId: invite.storeId,
        userId: user.id,
        staffRole: invite.assignedRole,
        permissions: invite.permissions,
        isActive: true,
      },
      include: { store: true },
    });

    // Mark invite as ACCEPTED (single-use only)
    await prisma.staffInvite.update({
      where: { id: invite.id },
      data: { status: StaffInviteStatus.ACCEPTED },
    });

    // If user is CUSTOMER, elevate role to STORE_STAFF
    if (user.role === Role.CUSTOMER) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          role: Role.STORE_STAFF,
          staffRole: invite.assignedRole,
          storeId: invite.storeId,
        },
      });
    }

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const tokens = generateTokens({
      id: updatedUser!.id,
      email: updatedUser!.email,
      name: updatedUser!.name,
      role: updatedUser!.role,
      staffRole: updatedUser!.staffRole,
      storeId: invite.storeId,
      permissions: JSON.parse(invite.permissions || "[]"),
    });

    return {
      success: true,
      message: "Successfully joined store staff.",
      membership,
      user: updatedUser,
      tokens,
    };
  }

  static async registerAndAcceptInvite(data: {
    inviteCode: string;
    name: string;
    password: string;
    email?: string;
  }) {
    const invite = await this.getInviteDetails(data.inviteCode);

    if (data.email && data.email.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
      throw new StaffServiceError(
        `This invitation was sent to ${invite.email}. The email provided (${data.email}) does not match.`,
        403,
        "EMAIL_MISMATCH"
      );
    }

    const cleanEmail = invite.email.toLowerCase().trim();
    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      const hashedPassword = await bcrypt.hash(data.password, 10);
      user = await prisma.user.create({
        data: {
          email: cleanEmail,
          password: hashedPassword,
          name: data.name,
          role: Role.STORE_STAFF,
          staffRole: invite.assignedRole,
          storeId: invite.storeId,
          isEmailVerified: true,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          role: Role.STORE_STAFF,
          staffRole: invite.assignedRole,
          storeId: invite.storeId,
        },
      });
    }

    const membership = await prisma.storeStaffMember.upsert({
      where: { storeId_userId: { storeId: invite.storeId, userId: user.id } },
      update: {
        staffRole: invite.assignedRole,
        permissions: invite.permissions,
        isActive: true,
      },
      create: {
        storeId: invite.storeId,
        userId: user.id,
        staffRole: invite.assignedRole,
        permissions: invite.permissions,
        isActive: true,
      },
      include: { store: true },
    });

    await prisma.staffInvite.update({
      where: { id: invite.id },
      data: { status: StaffInviteStatus.ACCEPTED },
    });

    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      staffRole: user.staffRole,
      storeId: invite.storeId,
      permissions: JSON.parse(invite.permissions || "[]"),
    });

    return {
      success: true,
      message: "Successfully joined store staff.",
      membership,
      user,
      tokens,
    };
  }

  static async listStoreStaff(storeId: number) {
    const members = await prisma.storeStaffMember.findMany({
      where: { storeId, isActive: true },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      avatarUrl: m.user.avatarUrl,
      staffRole: m.staffRole,
      permissions: (() => {
        try {
          return JSON.parse(m.permissions || "[]");
        } catch {
          return [];
        }
      })(),
      createdAt: m.createdAt,
    }));
  }

  static async updateStaffPermissions(
    storeId: number,
    targetUserId: number,
    data: { permissions?: string[]; staffRole?: StaffRole }
  ) {
    const membership = await prisma.storeStaffMember.findUnique({
      where: { storeId_userId: { storeId, userId: targetUserId } },
    });

    if (!membership) {
      throw new StaffServiceError("Staff membership not found.", 404);
    }

    const updated = await prisma.storeStaffMember.update({
      where: { id: membership.id },
      data: {
        permissions: data.permissions !== undefined ? JSON.stringify(data.permissions) : undefined,
        staffRole: data.staffRole !== undefined ? data.staffRole : undefined,
      },
    });

    if (data.staffRole !== undefined) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { staffRole: data.staffRole },
      }).catch(() => {});
    }

    return {
      success: true,
      staffRole: updated.staffRole,
      permissions: JSON.parse(updated.permissions || "[]"),
    };
  }

  static async removeStaffMember(storeId: number, targetUserId: number) {
    const membership = await prisma.storeStaffMember.findUnique({
      where: { storeId_userId: { storeId, userId: targetUserId } },
    });

    if (!membership) {
      throw new StaffServiceError("Staff membership not found.", 404);
    }

    await prisma.storeStaffMember.update({
      where: { id: membership.id },
      data: { isActive: false },
    });

    return { success: true, message: "Staff member removed from store." };
  }

  static async switchActiveStore(userId: number, targetStoreId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        ownedStores: true,
        memberships: {
          where: { storeId: targetStoreId, isActive: true },
          include: { store: true },
        },
      },
    });

    if (!user) {
      throw new StaffServiceError("User not found.", 404);
    }

    const ownsStore = user.ownedStores.some((s) => s.id === targetStoreId);
    const member = user.memberships[0];

    if (!ownsStore && !member && user.role !== Role.SUPER_ADMIN) {
      throw new StaffServiceError("You do not have access to this store.", 403);
    }

    const activeStaffRole = member ? member.staffRole : user.staffRole;
    let permissions: string[] = [];
    if (member) {
      try {
        permissions = JSON.parse(member.permissions || "[]");
      } catch {
        permissions = [];
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        storeId: targetStoreId,
        staffRole: activeStaffRole,
      },
    });

    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      staffRole: activeStaffRole,
      storeId: targetStoreId,
      permissions,
    };

    const tokens = generateTokens(tokenPayload);

    // Fetch all available stores for the refreshed user object
    const allMemberships = await prisma.storeStaffMember.findMany({
      where: { userId, isActive: true },
      include: { store: true },
    });

    const availableStores = [
      ...user.ownedStores.map((s) => ({ storeId: s.id, storeName: s.name, slug: s.slug, role: "OWNER" })),
      ...allMemberships.map((m) => ({
        storeId: m.store.id,
        storeName: m.store.name,
        slug: m.store.slug,
        role: m.staffRole,
        permissions: (() => {
          try {
            return JSON.parse(m.permissions || "[]");
          } catch {
            return [];
          }
        })(),
      })),
    ];

    const returnedUser = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      phone: updatedUser.phone,
      role: updatedUser.role,
      staffRole: activeStaffRole,
      storeId: targetStoreId,
      permissions,
      avatarUrl: updatedUser.avatarUrl,
      isEmailVerified: updatedUser.isEmailVerified,
      availableStores,
    };

    return {
      tokens,
      activeStoreId: targetStoreId,
      staffRole: activeStaffRole,
      permissions,
      user: returnedUser,
    };
  }
}
