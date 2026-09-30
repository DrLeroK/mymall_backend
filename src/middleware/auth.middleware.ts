import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { Role, StaffRole } from '@prisma/client';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required. Missing token.' });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }
}

export function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      req.user = verifyAccessToken(token);
    }
  } catch (error) {
    // Ignore invalid token for public optional auth
  }
  next();
}

export function authorizeRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Role '${req.user.role}' is not authorized to access this resource.`,
      });
    }
    next();
  };
}

export function authorizeStaffRole(...staffRoles: StaffRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    // Store owner and Super admin always have access to staff endpoints
    if (req.user.role === Role.SUPER_ADMIN || req.user.role === Role.STORE_OWNER) {
      return next();
    }
    if (req.user.role === Role.STORE_STAFF && req.user.staffRole && staffRoles.includes(req.user.staffRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Forbidden. Staff permission check failed.',
    });
  };
}
