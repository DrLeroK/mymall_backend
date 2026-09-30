import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { generateTokens, verifyRefreshToken } from '../utils/jwt';
import { OtpService } from '../services/otpService';
import { PasswordResetService } from '../services/passwordResetService';
import { Validator } from '../utils/validator';
import { Role } from '@prisma/client';

export class AuthController {
  /**
   * Request OTP verification code to be sent to user's email
   */
  static async sendOtp(req: Request, res: Response) {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ success: false, message: 'Valid email address is required.' });
      }

      const result = await OtpService.sendOtp(email);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Verify submitted OTP verification code
   */
  static async verifyOtp(req: Request, res: Response) {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Both email and 6-digit OTP code are required.' });
      }

      const result = await OtpService.verifyOtp(email, otp.toString());
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * User Registration (Store Owner or Customer) - Strictly requires verified email
   */
  static async register(req: Request, res: Response) {
    try {
      const { email, password, name, phone, role = Role.CUSTOMER } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: 'Email, password, and name are required.' });
      }

      // STRICT CHECK: Validate Password Complexity
      const passwordValidation = Validator.validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          code: 'WEAK_PASSWORD',
          message: passwordValidation.message,
        });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'User with this email already exists.' });
      }

      // STRICT CHECK: Verify email has been verified with OTP
      // For Super Admin initial creation or bypass in test environment if header present, we check OtpService
      const isVerified = await OtpService.isEmailVerified(normalizedEmail);
      if (!isVerified) {
        return res.status(400).json({
          success: false,
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email address has not been verified. Please request and verify your OTP before completing registration.',
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name,
          phone,
          role: role as Role,
          isEmailVerified: true,
        },
      });

      // Clear verification record
      await OtpService.consumeVerification(normalizedEmail);

      const tokenPayload = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        staffRole: user.staffRole,
        storeId: user.storeId,
      };

      const tokens = generateTokens(tokenPayload);

      return res.status(201).json({
        success: true,
        message: 'Registration successful! You may now browse the marketplace or set up your own store.',
        tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
        },
        nextSteps: {
          continueAsCustomer: '/storefront',
          setupStore: '/api/v1/stores/onboard',
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Switch or choose post-registration role (e.g. Upgrade from Customer to Store Owner)
   */
  static async chooseRole(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { targetRole } = req.body; // 'STORE_OWNER' or 'CUSTOMER'

      if (!targetRole || ![Role.STORE_OWNER, Role.CUSTOMER].includes(targetRole)) {
        return res.status(400).json({ success: false, message: 'Invalid targetRole. Allowed values: STORE_OWNER, CUSTOMER.' });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { role: targetRole },
        include: { ownedStores: true },
      });

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
        message: `Account role updated to ${targetRole}.`,
        tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * User Login
   */
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: {
          ownedStores: true,
          assignedStore: true,
        },
      });

      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials.' });
      }

      if (user.isActive === false) {
        return res.status(403).json({
          success: false,
          message: 'Your account or staff access has been deactivated by the store owner. Please contact your administrator.',
        });
      }

      // Determine active store ID for token context
      let activeStoreId: number | null = null;
      if (user.role === Role.STORE_OWNER && user.ownedStores.length > 0) {
        activeStoreId = user.ownedStores[0].id;
      } else if (user.role === Role.STORE_STAFF && user.assignedStore) {
        activeStoreId = user.assignedStore.id;
      }

      const tokenPayload = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        staffRole: user.staffRole,
        storeId: activeStoreId,
      };

      const tokens = generateTokens(tokenPayload);

      return res.json({
        success: true,
        message: 'Login successful',
        tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          staffRole: user.staffRole,
          storeId: activeStoreId,
          isEmailVerified: user.isEmailVerified,
          ownedStores: user.ownedStores,
          assignedStore: user.assignedStore,
        },
      });
    } catch (error: any) {
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
        return res.status(400).json({ success: false, message: 'Refresh token is required.' });
      }

      const decoded = verifyRefreshToken(refreshToken);

      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!user) {
        return res.status(401).json({ success: false, message: 'User no longer exists.' });
      }

      const tokens = generateTokens({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        staffRole: user.staffRole,
        storeId: decoded.storeId,
      });

      return res.json({ success: true, tokens });
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
    }
  }

  /**
   * Get Current Authenticated User Profile
   */
  static async me(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          staffRole: true,
          avatarUrl: true,
          storeId: true,
          isEmailVerified: true,
          ownedStores: true,
          assignedStore: true,
        },
      });

      return res.json({ success: true, user });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Request Password Reset Code
   */
  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ success: false, message: 'Valid email address is required.' });
      }

      const result = await PasswordResetService.requestPasswordReset(email);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Verify Submitted Password Reset Code
   */
  static async verifyResetCode(req: Request, res: Response) {
    try {
      const { email, resetCode } = req.body;
      if (!email || !resetCode) {
        return res.status(400).json({ success: false, message: 'Both email and 6-digit reset code are required.' });
      }

      const result = await PasswordResetService.verifyResetCode(email, resetCode.toString());
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Reset Password with Verified Code and New Password
   */
  static async resetPassword(req: Request, res: Response) {
    try {
      const { email, resetCode, newPassword } = req.body;
      if (!email || !resetCode || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Email, reset code, and new password are required.',
        });
      }

      const result = await PasswordResetService.resetPassword(email, resetCode.toString(), newPassword);
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update User Profile (Name, Phone)
   */
  static async updateProfile(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { name, phone } = req.body;

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(name && { name: name.trim() }),
          ...(phone !== undefined && { phone: phone.trim() }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          avatarUrl: true,
          storeId: true,
        },
      });

      return res.json({ success: true, message: 'Profile updated successfully.', user: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
