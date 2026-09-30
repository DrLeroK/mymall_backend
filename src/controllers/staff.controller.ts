import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { BillingService } from '../services/billingService';
import { Validator } from '../utils/validator';
import { generateTokens } from '../utils/jwt';
import { StaffRole, Role, StaffInviteStatus } from '@prisma/client';

export class StaffController {
  /**
   * Create a staff invitation code for a store.
   */
  static async createInvite(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { email, assignedRole = StaffRole.CASHIER } = req.body;

      if (!email) {
        return res.status(400).json({ success: false, message: 'Staff email is required.' });
      }

      // Check plan staff limit
      const limitCheck = await BillingService.canAddStaff(storeId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          success: false,
          message: `Staff limit reached for your plan. Maximum staff allowed: ${limitCheck.maxStaff}. Please upgrade your subscription.`,
        });
      }

      const inviteCode = `INV-${storeId}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

      const invite = await prisma.staffInvite.create({
        data: {
          storeId,
          email,
          assignedRole: assignedRole as StaffRole,
          inviteCode,
          invitedById: req.user!.id,
          expiresAt,
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Staff invite generated successfully.',
        invite,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Accept staff invitation code (register or join store).
   */
  static async acceptInvite(req: Request, res: Response) {
    try {
      const { inviteCode, password, name } = req.body;

      if (!inviteCode) {
        return res.status(400).json({ success: false, message: 'Invite code is required.' });
      }

      const invite = await prisma.staffInvite.findUnique({
        where: { inviteCode },
        include: { store: true },
      });

      if (!invite || invite.status !== StaffInviteStatus.PENDING || invite.expiresAt < new Date()) {
        return res.status(400).json({ success: false, message: 'Invalid or expired staff invite code.' });
      }

      let user = await prisma.user.findUnique({ where: { email: invite.email } });

      if (user) {
        // Update existing user role & store assignment
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            role: Role.STORE_STAFF,
            staffRole: invite.assignedRole,
            storeId: invite.storeId,
          },
        });
      } else {
        if (!password || !name) {
          return res.status(400).json({ success: false, message: 'Name and password are required for new staff registration.' });
        }

        const passwordValidation = Validator.validatePassword(password);
        if (!passwordValidation.isValid) {
          return res.status(400).json({ success: false, message: passwordValidation.message });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user = await prisma.user.create({
          data: {
            email: invite.email,
            password: hashedPassword,
            name,
            role: Role.STORE_STAFF,
            staffRole: invite.assignedRole,
            storeId: invite.storeId,
          },
        });
      }

      // Mark invite as accepted
      await prisma.staffInvite.update({
        where: { id: invite.id },
        data: { status: StaffInviteStatus.ACCEPTED },
      });

      // Generate tokens so user is immediately logged in
      const tokens = generateTokens({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        staffRole: user.staffRole,
        storeId: user.storeId,
      });

      return res.json({
        success: true,
        message: `Successfully joined ${invite.store.name} as ${invite.assignedRole}.`,
        tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          staffRole: user.staffRole,
          storeId: user.storeId,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * List staff members of a store.
   */
  static async listStaff(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const staff = await prisma.user.findMany({
        where: { storeId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          staffRole: true,
          isActive: true,
          createdAt: true,
        },
      });

      const invites = await prisma.staffInvite.findMany({
        where: { storeId, status: StaffInviteStatus.PENDING },
      });

      return res.json({ success: true, staff, pendingInvites: invites });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Change a staff member's role (CASHIER, MANAGER, INVENTORY_CLERK)
   */
  static async changeRole(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const staffId = parseInt(req.params.id, 10);
      const { staffRole } = req.body;

      if (!staffRole || !Object.values(StaffRole).includes(staffRole)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Allowed roles: ${Object.values(StaffRole).join(', ')}`,
        });
      }

      const staff = await prisma.user.findFirst({
        where: { id: staffId, storeId },
      });

      if (!staff) {
        return res.status(404).json({ success: false, message: 'Staff member not found in your store.' });
      }

      const updated = await prisma.user.update({
        where: { id: staffId },
        data: { staffRole: staffRole as StaffRole },
        select: { id: true, name: true, email: true, role: true, staffRole: true, isActive: true },
      });

      return res.json({
        success: true,
        message: `Updated ${updated.name}'s role to ${staffRole}.`,
        staff: updated,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Deactivate or Reactivate a staff member
   */
  static async toggleStaffStatus(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const staffId = parseInt(req.params.id, 10);

      const staff = await prisma.user.findFirst({
        where: { id: staffId, storeId },
      });

      if (!staff) {
        return res.status(404).json({ success: false, message: 'Staff member not found in your store.' });
      }

      const newStatus = !staff.isActive;
      const updated = await prisma.user.update({
        where: { id: staffId },
        data: { isActive: newStatus },
        select: { id: true, name: true, email: true, role: true, staffRole: true, isActive: true },
      });

      return res.json({
        success: true,
        message: `Staff member ${updated.name} has been ${newStatus ? 'reactivated' : 'deactivated'}.`,
        staff: updated,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete / Remove a staff member or revoke pending invite
   */
  static async deleteStaff(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const staffId = parseInt(req.params.id, 10);

      // Check if it's an existing staff member in this store
      const staff = await prisma.user.findFirst({
        where: { id: staffId, storeId },
      });

      if (staff) {
        // Disassociate user from store and revert role to CUSTOMER
        await prisma.user.update({
          where: { id: staffId },
          data: {
            storeId: null,
            role: Role.CUSTOMER,
            staffRole: null,
            isActive: true,
          },
        });

        return res.json({
          success: true,
          message: `Staff member ${staff.name} has been removed from this store.`,
        });
      }

      // Check if it's a pending invite
      const invite = await prisma.staffInvite.findFirst({
        where: { id: staffId, storeId },
      });

      if (invite) {
        await prisma.staffInvite.delete({
          where: { id: staffId },
        });

        return res.json({
          success: true,
          message: `Staff invite for ${invite.email} has been revoked and removed.`,
        });
      }

      return res.status(404).json({ success: false, message: 'Staff member or invite not found in your store.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
