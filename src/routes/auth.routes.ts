import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// OTP Endpoints
router.post('/send-otp', authLimiter, AuthController.sendOtp);
router.post('/verify-otp', authLimiter, AuthController.verifyOtp);

// Registration & Login
router.post('/register', authLimiter, AuthController.register);
router.post('/login', authLimiter, AuthController.login);
router.post('/refresh-token', AuthController.refreshToken);
router.get('/me', authenticate, AuthController.me);

// Profile update
router.patch('/profile', authenticate, AuthController.updateProfile);

// Role switching / post-registration choice
router.post('/choose-role', authenticate, AuthController.chooseRole);

// Password Reset Flow
router.post('/forgot-password', authLimiter, AuthController.forgotPassword);
router.post('/verify-reset-code', authLimiter, AuthController.verifyResetCode);
router.post('/reset-password', authLimiter, AuthController.resetPassword);

export default router;
