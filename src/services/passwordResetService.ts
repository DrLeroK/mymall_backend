import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { EmailService } from './emailService';
import { Validator } from '../utils/validator';

export class PasswordResetService {
  private static readonly RESET_CODE_EXPIRY_MINUTES = 15;

  /**
   * Request password reset for an email address.
   * Generates a 6-digit code and secure token, stores hashed record, and sends email.
   * Note: Returns generic success even if user not found to prevent account enumeration.
   */
  static async requestPasswordReset(email: string): Promise<{ success: boolean; message: string; debugCode?: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    if (!Validator.validateEmail(normalizedEmail)) {
      return { success: false, message: 'Please provide a valid email address.' };
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // If user does not exist, return generic success to prevent account enumeration attacks
    if (!user) {
      return {
        success: true,
        message: 'If an account exists with this email, a password reset code has been sent.',
      };
    }

    // Invalidate any existing unused reset codes for this email
    await prisma.passwordReset.updateMany({
      where: { email: normalizedEmail, isUsed: false },
      data: { isUsed: true },
    });

    // Generate 6-digit numeric code and secure random hex token
    const resetCode = crypto.randomInt(100000, 999999).toString();
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Hash the code/token for storage
    const tokenHash = await bcrypt.hash(`${resetCode}:${rawToken}`, 10);
    const expiresAt = new Date(Date.now() + this.RESET_CODE_EXPIRY_MINUTES * 60 * 1000);

    await prisma.passwordReset.create({
      data: {
        email: normalizedEmail,
        tokenHash,
        resetCode,
        expiresAt,
        isUsed: false,
      },
    });

    // Send formatted email via EmailService
    await EmailService.sendPasswordResetEmail(normalizedEmail, resetCode, rawToken);

    return {
      success: true,
      message: 'If an account exists with this email, a password reset code has been sent.',
      debugCode: process.env.NODE_ENV !== 'production' ? resetCode : undefined,
    };
  }

  /**
   * Verify a submitted 6-digit reset code
   */
  static async verifyResetCode(email: string, resetCode: string): Promise<{ success: boolean; message: string; resetToken?: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    if (!normalizedEmail || !resetCode) {
      return { success: false, message: 'Email and 6-digit reset code are required.' };
    }

    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        email: normalizedEmail,
        resetCode: resetCode.trim(),
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetRecord) {
      return { success: false, message: 'Invalid or expired password reset code. Please request a new one.' };
    }

    return {
      success: true,
      message: 'Reset code verified successfully. You may now set your new password.',
      resetToken: resetRecord.resetCode,
    };
  }

  /**
   * Reset the user's password using the verified code and new strong password
   */
  static async resetPassword(email: string, resetCode: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    if (!normalizedEmail || !resetCode || !newPassword) {
      return { success: false, message: 'Email, reset code, and new password are required.' };
    }

    // STRICT: Validate new password complexity
    const passwordValidation = Validator.validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return { success: false, message: passwordValidation.message || 'Password does not meet complexity requirements.' };
    }

    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        email: normalizedEmail,
        resetCode: resetCode.trim(),
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetRecord) {
      return { success: false, message: 'Invalid or expired password reset code. Please request a new one.' };
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return { success: false, message: 'User account not found.' };
    }

    // Hash new password with bcrypt
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Atomically update password and mark reset record used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { isUsed: true },
      }),
    ]);

    // Send confirmation email
    await EmailService.sendPasswordResetSuccessEmail(normalizedEmail);

    return {
      success: true,
      message: 'Your password has been successfully reset. You can now log in with your new password.',
    };
  }
}
