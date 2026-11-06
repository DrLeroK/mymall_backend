import { Request, Response } from "express";
import { StaffService, StaffServiceError } from "../services/staffService";
import { prisma } from "../config/db";
import { StaffRole, StaffInviteStatus } from "@prisma/client";

export class StaffController {
  /**
   * Create a staff invitation code for a store (plan limit enforced)
   */
  static async createInvite(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const { email, assignedRole = StaffRole.CASHIER, permissions = [] } = req.body;

      if (!email) {
        return res.status(400).json({ success: false, message: "Staff email is required." });
      }

      const invite = await StaffService.inviteStaff(
        storeId,
        req.user!.id,
        email,
        assignedRole as StaffRole,
        permissions
      );

      return res.status(201).json({
        success: true,
        message: "Staff invite generated and sent to " + email,
        invite,
      });
    } catch (error: any) {
      if (error instanceof StaffServiceError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Preview staff invitation details before accepting
   */
  static async getInviteDetails(req: Request, res: Response) {
    try {
      const { code } = req.params;
      if (!code) {
        return res.status(400).json({ success: false, message: "Invite code is required." });
      }
      const invite = await StaffService.getInviteDetails(code);
      return res.json({ success: true, invite });
    } catch (error: any) {
      if (error instanceof StaffServiceError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Accept staff invitation code (strictly validates that user email matches invite email)
   */
  static async acceptInvite(req: Request, res: Response) {
    try {
      const { inviteCode, name, password, email } = req.body;

      if (!inviteCode) {
        return res.status(400).json({ success: false, message: "Invite code is required." });
      }

      if (req.user) {
        // Authenticated flow: ensure invite email strictly matches logged in user
        const result = await StaffService.acceptInvite(inviteCode, req.user.id);
        return res.json(result);
      } else {
        // Unauthenticated flow: register and accept invite with matching email
        if (!password || !name) {
          return res.status(400).json({ success: false, message: "Name and password are required to accept invitation." });
        }
        const result = await StaffService.registerAndAcceptInvite({
          inviteCode,
          name,
          password,
          email,
        });
        return res.json(result);
      }
    } catch (error: any) {
      if (error instanceof StaffServiceError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * List staff members of a store (multi-store members with custom permissions)
   */
  static async listStaff(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const staff = await StaffService.listStoreStaff(storeId);
      const pendingInvites = await prisma.staffInvite.findMany({
        where: { storeId, status: StaffInviteStatus.PENDING },
      });

      return res.json({ success: true, staff, pendingInvites });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Change a staff member role or grant custom permission overrides
   */
  static async updatePermissions(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const staffUserId = parseInt(req.params.id, 10);
      const { staffRole, permissions } = req.body;

      const result = await StaffService.updateStaffPermissions(storeId, staffUserId, {
        staffRole: staffRole as StaffRole,
        permissions,
      });

      return res.json({ message: "Staff permissions successfully updated.", ...result });
    } catch (error: any) {
      if (error instanceof StaffServiceError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async changeRole(req: Request, res: Response) {
    return StaffController.updatePermissions(req, res);
  }

  /**
   * Switch Active Store Context for Multi-Store Staff
   */
  static async switchStore(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const storeId = req.body.storeId || req.body.targetStoreId;

      if (!storeId) {
        return res.status(400).json({ success: false, message: "storeId is required to switch store." });
      }

      const result = await StaffService.switchActiveStore(userId, parseInt(storeId, 10));
      return res.json({ success: true, message: "Active store context switched.", ...result });
    } catch (error: any) {
      if (error instanceof StaffServiceError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Remove a staff member or revoke pending invite
   */
  static async deleteStaff(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const targetId = parseInt(req.params.id, 10);

      // Try removing membership first
      try {
        const result = await StaffService.removeStaffMember(storeId, targetId);
        return res.json(result);
      } catch {
        // If not membership, check if pending invite
        const invite = await prisma.staffInvite.findFirst({
          where: { id: targetId, storeId },
        });
        if (invite) {
          await prisma.staffInvite.delete({ where: { id: targetId } });
          return res.json({ success: true, message: "Staff invite revoked." });
        }
        return res.status(404).json({ success: false, message: "Staff member or invite not found." });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async toggleStaffStatus(req: Request, res: Response) {
    try {
      const storeId = req.storeId!;
      const staffUserId = parseInt(req.params.id, 10);
      const membership = await prisma.storeStaffMember.findUnique({
        where: { storeId_userId: { storeId, userId: staffUserId } },
      });
      if (!membership) {
        return res.status(404).json({ success: false, message: "Staff member not found." });
      }
      const updated = await prisma.storeStaffMember.update({
        where: { id: membership.id },
        data: { isActive: !membership.isActive },
      });
      return res.json({
        success: true,
        message: "Staff member status updated.",
        isActive: updated.isActive,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
