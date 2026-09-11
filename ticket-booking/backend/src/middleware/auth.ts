/**
 * JWT 인증 미들웨어 (make.md sequenceDiagram Step 1)
 */
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Errors } from '../errors';
import { isTokenRevoked } from '../services/tokenService';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): string {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    return payload.sub;
  } catch {
    throw Errors.unauthorized('토큰이 유효하지 않습니다.');
  }
}

/** iat까지 함께 검증 (무효화 검사용) */
export function verifyTokenWithIat(token: string): { userId: string; iat?: number } {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string; iat?: number };
    return { userId: payload.sub, iat: payload.iat };
  } catch {
    throw Errors.unauthorized('토큰이 유효하지 않습니다.');
  }
}

export async function authMiddleware(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw Errors.unauthorized();
    }
    const { userId, iat } = verifyTokenWithIat(header.slice(7));
    // 로그아웃 등으로 무효화된 토큰 거부
    if (await isTokenRevoked(userId, iat)) {
      throw Errors.unauthorized('만료되었거나 무효화된 토큰입니다.');
    }
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}
