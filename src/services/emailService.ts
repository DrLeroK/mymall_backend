import nodemailer, { Transporter } from 'nodemailer';

export class EmailService {
  private static transporter: Transporter | null = null;

  private static getTransporter() {
    if (!this.transporter) {
      const host = process.env.SMTP_HOST;
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      if (host && user && pass) {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
      }
    }
    return this.transporter;
  }

  /**
   * Send 6-digit OTP to user's email address
   */
  static async sendOtpEmail(email: string, otp: string): Promise<boolean> {
    const transporter = this.getTransporter();
    const fromAddress = process.env.EMAIL_FROM || '"MyMall Platform" <noreply@mymall.com>';

    const subject = `Your MyMall Verification Code: ${otp}`;
    const text = `Hello,\n\nYour MyMall email verification code is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this code, please ignore this email.\n\nBest regards,\nThe MyMall Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">MyMall Verification Code</h2>
        <p style="color: #475569; font-size: 16px;">Hello,</p>
        <p style="color: #475569; font-size: 16px;">Please use the following 6-digit One-Time Password (OTP) to verify your email address:</p>
        <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e293b;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code will expire in <strong>10 minutes</strong>. If you did not request this verification, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">MyMall Multi-Tenant E-Commerce Platform</p>
      </div>
    `;

    // If SMTP credentials are configured, send real email
    if (transporter) {
      try {
        await transporter.sendMail({
          from: fromAddress,
          to: email,
          subject,
          text,
          html,
        });
        console.log(`📧 [EmailService] OTP sent successfully to ${email} via SMTP.`);
        return true;
      } catch (err: any) {
        console.error(`❌ [EmailService] Failed to send email via SMTP:`, err.message);
        // Fall back to console logger in dev/testing
      }
    }

    // Development / Fallback mode: Print code prominently in logs
    console.log(`
=============================================================
📬 [DEV/MOCK EMAIL DISPATCH]
To: ${email}
Subject: ${subject}
OTP Code: >>> ${otp} <<< (Expires in 10 mins)
=============================================================`);
    return true;
  }

  /**
   * Send Password Reset Code and instructions to user's email
   */
  static async sendPasswordResetEmail(email: string, resetCode: string, resetToken: string): Promise<boolean> {
    const transporter = this.getTransporter();
    const fromAddress = process.env.EMAIL_FROM || '"MyMall Platform" <noreply@mymall.com>';

    const subject = `Your MyMall Password Reset Code: ${resetCode}`;
    const text = `Hello,\n\nWe received a request to reset your MyMall password.\n\nYour 6-digit password reset code is: ${resetCode}\nReset Token: ${resetToken}\n\nThis code will expire in 15 minutes. If you did not request this, please secure your account immediately.\n\nBest regards,\nThe MyMall Security Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #dc2626; margin-top: 0;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 16px;">Hello,</p>
        <p style="color: #475569; font-size: 16px;">We received a request to reset your MyMall account password. Enter this 6-digit code to continue:</p>
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 6px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #991b1b;">${resetCode}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code will expire in <strong>15 minutes</strong>.</p>
        <p style="color: #64748b; font-size: 13px;">If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">MyMall Multi-Tenant E-Commerce Platform</p>
      </div>
    `;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: fromAddress,
          to: email,
          subject,
          text,
          html,
        });
        console.log(`📧 [EmailService] Password reset code sent to ${email} via SMTP.`);
        return true;
      } catch (err: any) {
        console.error(`❌ [EmailService] Failed to send password reset email via SMTP:`, err.message);
      }
    }

    console.log(`
=============================================================
📬 [DEV/MOCK PASSWORD RESET EMAIL]
To: ${email}
Subject: ${subject}
Reset Code: >>> ${resetCode} <<< (Expires in 15 mins)
Reset Token: ${resetToken}
=============================================================`);
    return true;
  }

  /**
   * Send Password Reset Success confirmation email
   */
  static async sendPasswordResetSuccessEmail(email: string): Promise<boolean> {
    const transporter = this.getTransporter();
    const fromAddress = process.env.EMAIL_FROM || '"MyMall Platform" <noreply@mymall.com>';

    const subject = `Your MyMall password has been reset`;
    const text = `Hello,\n\nYour password for your MyMall account has been successfully updated.\n\nIf you did not make this change, please contact support immediately.\n\nBest regards,\nThe MyMall Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #16a34a; margin-top: 0;">Password Successfully Updated</h2>
        <p style="color: #475569; font-size: 16px;">Hello,</p>
        <p style="color: #475569; font-size: 16px;">Your MyMall password was recently changed. You can now log in with your new password.</p>
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; margin: 20px 0;">
          <p style="color: #166534; font-size: 14px; margin: 0;">If you did not initiate this change, please contact our support team immediately.</p>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">MyMall Multi-Tenant E-Commerce Platform</p>
      </div>
    `;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: fromAddress,
          to: email,
          subject,
          text,
          html,
        });
        console.log(`📧 [EmailService] Password reset confirmation sent to ${email} via SMTP.`);
        return true;
      } catch (err: any) {
        console.error(`❌ [EmailService] Failed to send confirmation email via SMTP:`, err.message);
      }
    }

    return true;
  }
}
