/**
 * 인증 API (make.md sequenceDiagram Step 1)
 * POST /auth/login, POST /auth/logout
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import * as authService from '../services/authService';
import * as sessionService from '../services/sessionService';
import * as tokenService from '../services/tokenService';
import { LoginRequest, LoginResponse, LogoutResponse } from '../../../shared/types';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as LoginRequest;
    const { token, userId } = authService.login(email, password);
    await sessionService.createSession(userId);
    const body: LoginResponse = { token, userId };
    res.json(body);
  }),
);

// 로그아웃: 발급된 토큰 무효화 + 세션 정리
authRouter.post(
  '/logout',
  authMiddleware,
  asyncHandler(async (req: AuthedRequest, res) => {
    await tokenService.invalidateUserTokens(req.userId!);
    await sessionService.clearSession(req.userId!);
    const body: LogoutResponse = { ok: true };
    res.json(body);
  }),
);
