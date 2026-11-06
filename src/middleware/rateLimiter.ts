import rateLimit from 'express-rate-limit';

// Strict limiter for authentication, OTP sending, and login endpoints
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // Max 20 requests per windowMs
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts or OTP requests. Please wait a few minutes before trying again.',
  },
});

// General limiter for public API endpoints
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // 600 requests per IP per 15 minutes
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Rate limit exceeded. Please slow down your requests.',
  },
});
