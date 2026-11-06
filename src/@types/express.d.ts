import { Role, StaffRole } from '@prisma/client';

export interface AuthUserPayload {
  id: number;
  email: string;
  name: string;
  role: Role;
  staffRole?: StaffRole | null;
  storeId?: number | null;
  permissions?: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
      storeId?: number;
      isSuspended?: boolean;
    }
  }
}
