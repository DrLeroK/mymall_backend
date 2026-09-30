import jwt from 'jsonwebtoken';
import { AuthUserPayload } from '../@types/express';

const JWT_SECRET = process.env.JWT_SECRET || 'mymall_default_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'mymall_default_refresh_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function generateTokens(payload: AuthUserPayload): TokenPair {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN as any });
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): AuthUserPayload {
  return jwt.verify(token, JWT_SECRET) as AuthUserPayload;
}

export function verifyRefreshToken(token: string): AuthUserPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as AuthUserPayload;
}
