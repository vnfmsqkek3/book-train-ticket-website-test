/**
 * JWT 인증 미들웨어 (make.md sequenceDiagram Step 1)
 */
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Errors } from '../errors';

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

export function authMiddleware(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw Errors.unauthorized();
  }
  req.userId = verifyToken(header.slice(7));
  next();
}
