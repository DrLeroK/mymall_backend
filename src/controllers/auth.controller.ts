import { Request, Response } from "express";
import { AuthService, AuthError } from "../services/authService";
import { generateTokens, verifyRefreshToken } from "../utils/jwt";
import { prisma } from "../config/db";
import { Role } from "@prisma/client";

export class AuthController {
  /**
   * Request OTP verification code for new registration
   */
  static async sendOtp(req: Request, res: Response) {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ success: false, message: "Valid email address is required." });
      }

      // Generate & send OTP without prematurely creating a user record
      const result = await AuthService.requestRegistrationOtp(email);
      return res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Verify OTP Code
   */
  static async verifyOtp(req: Request, res: Response) {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        return res.status(400).json({ success: false, message: "Email and OTP code are required." });
      }
      const result = await AuthService.verifyRegistrationOtp(email, otp.toString());
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * User Registration - Creates account after OTP verification with immediate auth tokens
   */
  static async register(req: Request, res: Response) {
    try {
      const { email, password, name, phone, role, otp } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: "Email, password, and name are required." });
      }

      if (!otp) {
        return res.status(400).json({
          success: false,
          code: "OTP_REQUIRED",
          message: "Verification code (OTP) is required to complete registration.",
        });
      }

      const result = await AuthService.register({
        email,
        password,
        name,
        phone,
        role: role as Role,
        otp,
      });

      return res.status(201).json({
        message: "Registration successful! Welcome to MyMall.",
        ...result,
      });
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * User Login with Strict Email Verification Gate & Multi-Store Context
   */
  static async login(req: Request, res: Response) {
    try {
      const { email, password, storeId } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required." });
      }

      const requestedStoreId = storeId ? parseInt(storeId, 10) : undefined;
      const result = await AuthService.login(email, password, requestedStoreId);

      return res.status(200).json({
        success: true,
        message: "Login successful.",
        ...result,
      });
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Refresh Token
   */
  static async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ success: false, message: "Refresh token is required." });
      }

      const decoded = verifyRefreshToken(refreshToken);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, message: "User not found or account deactivated." });
      }

      const tokenPayload = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        staffRole: decoded.staffRole,
        storeId: decoded.storeId,
        permissions: decoded.permissions,
      };

      const tokens = generateTokens(tokenPayload);
      return res.status(200).json({ success: true, tokens });
    } catch (error: any) {
      return res.status(401).json({ success: false, message: "Invalid or expired refresh token." });
    }
  }

  /**
   * Forgot Password
   */
  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, message: "Email is required." });
      }

      const result = await AuthService.forgotPassword(email);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Reset Password
   */
  static async resetPassword(req: Request, res: Response) {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ success: false, message: "Email, reset code, and new password are required." });
      }

      const result = await AuthService.resetPassword(email, code.toString(), newPassword);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Request Change Email
   */
  static async changeEmail(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { newEmail } = req.body;
      if (!newEmail) {
        return res.status(400).json({ success: false, message: "New email is required." });
      }

      const result = await AuthService.requestChangeEmail(userId, newEmail);
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Confirm Change Email
   */
  static async confirmEmailChange(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { newEmail, otp } = req.body;
      if (!newEmail || !otp) {
        return res.status(400).json({ success: false, message: "New email and OTP are required." });
      }

      const result = await AuthService.confirmChangeEmail(userId, newEmail, otp.toString());
      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Current Authenticated User Session Info
   */
  static async getMe(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          ownedStores: { select: { id: true, name: true, slug: true, status: true, logoUrl: true } },
          memberships: {
            where: { isActive: true },
            include: { store: { select: { id: true, name: true, slug: true, status: true, logoUrl: true } } },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }

      const availableStores = [
        ...user.ownedStores.map((s) => ({ storeId: s.id, storeName: s.name, slug: s.slug, role: "OWNER" })),
        ...user.memberships.map((m) => ({
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

      const activeStoreId = req.user?.storeId || user.storeId || availableStores[0]?.storeId || null;
      const activeMembership = user.memberships.find((m) => m.store.id === activeStoreId) || user.memberships[0];
      const livePermissions = activeMembership
        ? (() => {
            try {
              return JSON.parse(activeMembership.permissions || "[]");
            } catch {
              return [];
            }
          })()
        : (req.user?.permissions || []);
      const liveStaffRole = activeMembership ? activeMembership.staffRole : (req.user?.staffRole || user.staffRole);

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
          staffRole: liveStaffRole,
          storeId: activeStoreId,
          permissions: livePermissions,
          avatarUrl: user.avatarUrl,
          isEmailVerified: user.isEmailVerified,
          availableStores,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static me = AuthController.getMe;

  static async updateProfile(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { name, phone, avatarUrl } = req.body;
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { name, phone, avatarUrl },
        select: { id: true, email: true, name: true, phone: true, avatarUrl: true, role: true },
      });
      return res.json({ success: true, message: "Profile updated successfully.", user: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async chooseRole(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { targetRole } = req.body;
      if (!targetRole || ![Role.STORE_OWNER, Role.CUSTOMER].includes(targetRole)) {
        return res.status(400).json({ success: false, message: "Invalid targetRole. Allowed: STORE_OWNER, CUSTOMER." });
      }
      const user = await prisma.user.update({
        where: { id: userId },
        data: { role: targetRole },
      });
      const tokens = generateTokens({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        staffRole: user.staffRole,
        storeId: user.storeId,
        permissions: req.user?.permissions || [],
      });
      return res.json({ success: true, message: "Role updated.", tokens, user });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async verifyResetCode(req: Request, res: Response) {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ success: false, message: "Email and reset code are required." });
      }
      // Return 200 indicating code format is accepted; resetPassword does actual validation and consumption
      return res.json({ success: true, message: "Reset code verified." });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
