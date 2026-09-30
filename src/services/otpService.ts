import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { EmailService } from './emailService';

export class OtpService {
  /**
   * Generate 6-digit OTP, store hashed record, and send email
   */
  static async sendOtp(email: string): Promise<{ success: boolean; message: string; devOtp?: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Generate random 6-digit OTP string
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Upsert into EmailVerification
    await prisma.emailVerification.upsert({
      where: { email: normalizedEmail },
      update: {
        otpHash,
        expiresAt,
        isVerified: false,
      },
      create: {
        email: normalizedEmail,
        otpHash,
        expiresAt,
        isVerified: false,
      },
    });

    // Send email
    await EmailService.sendOtpEmail(normalizedEmail, otp);

    const isDev = process.env.NODE_ENV !== 'production';

    return {
      success: true,
      message: 'A 6-digit verification code has been sent to your email address.',
      ...(isDev ? { devOtp: otp } : {}), // helpful in test / development responses
    };
  }

  /**
   * Verify the 6-digit OTP code against the database record
   */
  static async verifyOtp(email: string, otp: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const record = await prisma.emailVerification.findUnique({
      where: { email: normalizedEmail },
    });

    if (!record) {
      return { success: false, message: 'No OTP verification request found for this email. Please request a new code.' };
    }

    if (new Date() > record.expiresAt) {
      return { success: false, message: 'Verification code has expired. Please request a new code.' };
    }

    const isMatch = await bcrypt.compare(otp, record.otpHash);
    if (!isMatch) {
      return { success: false, message: 'Invalid verification code. Please check and try again.' };
    }

    // Mark as verified
    await prisma.emailVerification.update({
      where: { email: normalizedEmail },
      data: { isVerified: true },
    });

    return { success: true, message: 'Email address verified successfully. You may now complete registration.' };
  }

  /**
   * Check if an email has already been verified via OTP
   */
  static async isEmailVerified(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    const record = await prisma.emailVerification.findUnique({
      where: { email: normalizedEmail },
    });

    if (!record || !record.isVerified) {
      return false;
    }

    // Check if verification happened within the last 2 hours
    const maxAgeMs = 2 * 60 * 60 * 1000;
    if (Date.now() - record.updatedAt.getTime() > maxAgeMs) {
      return false;
    }

    return true;
  }

  /**
   * Remove/reset verification record once registration is finalized
   */
  static async consumeVerification(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    try {
      await prisma.emailVerification.delete({
        where: { email: normalizedEmail },
      });
    } catch {
      // Ignore if record was already deleted
    }
  }
}
