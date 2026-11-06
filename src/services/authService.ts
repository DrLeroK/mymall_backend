import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { Role, StaffRole } from '@prisma/client';
import { generateTokens } from '../utils/jwt';
import { generateOTP, hashOTP, verifyOTP } from './otpService';
import { sendVerificationEmail, sendPasswordResetEmail } from './emailService';

export class AuthError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function validateStrongPassword(password: string): { isValid: boolean; message?: string } {
  if (!password || password.length < 8) {
    return { isValid: false, message: 'Password must be at least 8 characters long.' };
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
    return {
      isValid: false,
      message: 'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character.',
    };
  }
  return { isValid: true };
}

export class AuthService {
  /**
   * Request OTP for registration without creating user record
   */
  static async requestRegistrationOtp(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new AuthError('An account with this email already exists.', 409, 'EMAIL_EXISTS');
    }

    // Generate 6-digit cryptographic OTP
    const otp = generateOTP(6);
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.emailVerification.upsert({
      where: { email: normalizedEmail },
      update: { otpHash, expiresAt, isVerified: false },
      create: { email: normalizedEmail, otpHash, expiresAt, isVerified: false },
    });

    try {
      await sendVerificationEmail(normalizedEmail, otp);
    } catch (err) {
      console.warn('Could not send verification email via SMTP (will still allow OTP check in dev/test):', err);
    }

    return {
      success: true,
      message: 'Verification code sent to email.',
      otp: process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  /**
   * Verify OTP code against the exact email it was sent to
   */
  static async verifyRegistrationOtp(email: string, otp: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const record = await prisma.emailVerification.findUnique({ where: { email: normalizedEmail } });
    if (!record) {
      throw new AuthError('No verification request found for this email.', 404, 'NOT_FOUND');
    }

    if (new Date() > record.expiresAt) {
      throw new AuthError('Verification code has expired. Please request a new code.', 400, 'EXPIRED_OTP');
    }

    const isValid = verifyOTP(otp, record.otpHash);
    if (!isValid) {
      throw new AuthError('Invalid verification code.', 400, 'INVALID_OTP');
    }

    await prisma.emailVerification.update({
      where: { email: normalizedEmail },
      data: { isVerified: true },
    });

    return { success: true, message: 'Email code verified successfully.' };
  }

  /**
   * User Registration - strictly creates user AFTER OTP verification
   */
  static async register(data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role?: Role;
    otp?: string;
  }) {
    const normalizedEmail = data.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new AuthError('An account with this email already exists.', 409, 'EMAIL_EXISTS');
    }

    const passwordCheck = validateStrongPassword(data.password);
    if (!passwordCheck.isValid) {
      throw new AuthError(passwordCheck.message!, 400, 'WEAK_PASSWORD');
    }

    // Verify OTP against the exact email
    if (data.otp) {
      const record = await prisma.emailVerification.findUnique({ where: { email: normalizedEmail } });
      if (!record) {
        throw new AuthError('Please request an email verification code first.', 400, 'OTP_REQUIRED');
      }
      if (new Date() > record.expiresAt) {
        throw new AuthError('Verification code has expired. Please request a new code.', 400, 'EXPIRED_OTP');
      }
      const isValid = verifyOTP(data.otp.toString(), record.otpHash);
      if (!isValid) {
        throw new AuthError('Invalid verification code.', 400, 'INVALID_OTP');
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new AuthError('Verification code (OTP) is required to complete registration.', 400, 'OTP_REQUIRED');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: data.name,
        phone: data.phone,
        role: data.role || Role.CUSTOMER,
        isEmailVerified: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });

    // Delete verification record after consumption
    await prisma.emailVerification.deleteMany({ where: { email: normalizedEmail } });

    // Generate tokens for immediate login
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: [],
    });

    return {
      success: true,
      user,
      tokens,
    };
  }

  static async verifyEmail(email: string, otp: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const record = await prisma.emailVerification.findUnique({ where: { email: normalizedEmail } });
    if (!record) {
      throw new AuthError('No verification request found for this email.', 404, 'NOT_FOUND');
    }

    if (new Date() > record.expiresAt) {
      throw new AuthError('Verification code has expired. Please request a new code.', 400, 'EXPIRED_OTP');
    }

    const isValid = verifyOTP(otp, record.otpHash);
    if (!isValid) {
      throw new AuthError('Invalid verification code.', 400, 'INVALID_OTP');
    }

    await prisma.emailVerification.update({
      where: { email: normalizedEmail },
      data: { isVerified: true },
    });

    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user) {
      user = await prisma.user.update({
        where: { email: normalizedEmail },
        data: { isEmailVerified: true },
      });
    }

    return { success: true, message: 'Email successfully verified.', user };
  }

  static async login(email: string, password: string, requestedStoreId?: number) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        ownedStores: { select: { id: true, name: true, slug: true, status: true } },
        memberships: {
          where: { isActive: true },
          include: { store: { select: { id: true, name: true, slug: true, status: true } } },
        },
      },
    });

    if (!user) {
      throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // STRICT EMAIL VERIFICATION GATE
    if (!user.isEmailVerified) {
      throw new AuthError(
        'Your email is not verified. Please verify your email before logging in.',
        403,
        'EMAIL_NOT_VERIFIED'
      );
    }

    if (!user.isActive) {
      throw new AuthError('Your account has been deactivated. Please contact support.', 403, 'ACCOUNT_DEACTIVATED');
    }

    // Determine available stores and active store context
    const availableStores = [
      ...user.ownedStores.map((s) => ({ storeId: s.id, storeName: s.name, slug: s.slug, role: 'OWNER' })),
      ...user.memberships.map((m) => ({
        storeId: m.store.id,
        storeName: m.store.name,
        slug: m.store.slug,
        role: m.staffRole,
        permissions: (() => {
          try {
            return JSON.parse(m.permissions || '[]');
          } catch {
            return [];
          }
        })(),
      })),
    ];

    let activeStoreId: number | null = null;
    let activeStaffRole: StaffRole | null = user.staffRole;
    let activePermissions: string[] = [];

    if (requestedStoreId) {
      const match = availableStores.find((s) => s.storeId === requestedStoreId);
      if (match) {
        activeStoreId = match.storeId;
        if (match.role !== 'OWNER') {
          activeStaffRole = match.role as StaffRole;
          activePermissions = (match as any).permissions || [];
        }
      }
    } else if (availableStores.length > 0) {
      activeStoreId = availableStores[0].storeId;
      if (availableStores[0].role !== 'OWNER') {
        activeStaffRole = availableStores[0].role as StaffRole;
        activePermissions = (availableStores[0] as any).permissions || [];
      }
    } else if (user.storeId) {
      activeStoreId = user.storeId;
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      staffRole: activeStaffRole,
      storeId: activeStoreId,
      permissions: activePermissions,
    };

    const tokens = generateTokens(tokenPayload);

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        staffRole: activeStaffRole,
        storeId: activeStoreId,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        permissions: activePermissions,
        availableStores,
      },
    };
  }

  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      // Return generic message to prevent email enumeration
      return { success: true, message: 'If this email exists, a password reset code has been sent.' };
    }

    const resetCode = generateOTP(6);
    const tokenHash = hashOTP(resetCode);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.passwordReset.create({
      data: {
        email: user.email,
        tokenHash,
        resetCode,
        expiresAt,
        isUsed: false,
      },
    });

    try {
      await sendPasswordResetEmail(user.email, resetCode, user.name);
    } catch (err) {
      console.warn('Failed to send reset email:', err);
    }

    return {
      success: true,
      message: 'If this email exists, a password reset code has been sent.',
      code: process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' ? resetCode : undefined,
    };
  }

  static async resetPassword(email: string, code: string, newPassword: string) {
    const passwordCheck = validateStrongPassword(newPassword);
    if (!passwordCheck.isValid) {
      throw new AuthError(passwordCheck.message!, 400, 'WEAK_PASSWORD');
    }

    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        email: email.toLowerCase(),
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetRecord) {
      throw new AuthError('Invalid or expired password reset code.', 400, 'INVALID_CODE');
    }

    const isValid = verifyOTP(code, resetRecord.tokenHash);
    if (!isValid) {
      throw new AuthError('Invalid or expired password reset code.', 400, 'INVALID_CODE');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { email: email.toLowerCase() },
        data: { password: hashedPassword },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { isUsed: true },
      }),
    ]);

    return { success: true, message: 'Password has been successfully updated.' };
  }

  static async requestChangeEmail(userId: number, newEmail: string) {
    const existing = await prisma.user.findUnique({ where: { email: newEmail.toLowerCase() } });
    if (existing) {
      throw new AuthError('Email address is already in use.', 409, 'EMAIL_EXISTS');
    }

    const otp = generateOTP(6);
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.emailVerification.upsert({
      where: { email: newEmail.toLowerCase() },
      update: { otpHash, expiresAt, isVerified: false },
      create: { email: newEmail.toLowerCase(), otpHash, expiresAt, isVerified: false },
    });

    try {
      await sendVerificationEmail(newEmail, otp, 'User');
    } catch (err) {
      console.warn('Could not send email:', err);
    }

    return {
      success: true,
      message: 'Verification code sent to new email address.',
      otp: process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  static async confirmChangeEmail(userId: number, newEmail: string, otp: string) {
    const record = await prisma.emailVerification.findUnique({ where: { email: newEmail.toLowerCase() } });
    if (!record || new Date() > record.expiresAt) {
      throw new AuthError('Invalid or expired verification code.', 400, 'INVALID_OTP');
    }

    const isValid = verifyOTP(otp, record.otpHash);
    if (!isValid) {
      throw new AuthError('Invalid verification code.', 400, 'INVALID_OTP');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { email: newEmail.toLowerCase(), isEmailVerified: true },
      select: { id: true, email: true, name: true, role: true },
    });

    await prisma.emailVerification.update({
      where: { email: newEmail.toLowerCase() },
      data: { isVerified: true },
    });

    return { success: true, message: 'Email address successfully updated.', user: updatedUser };
  }
}
