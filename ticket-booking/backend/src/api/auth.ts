/**
 * 인증 API (make.md sequenceDiagram Step 1)
 * POST /auth/login
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as authService from '../services/authService';
import * as sessionService from '../services/sessionService';
import { LoginRequest, LoginResponse } from '../../../shared/types';

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
