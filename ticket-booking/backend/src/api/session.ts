/**
 * 세션 조회 API (make.md sequenceDiagram 에러 복구 — 재연결 후 상태 복구)
 * GET /session/:userId
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import * as sessionService from '../services/sessionService';
import { SessionResponse } from '../../../shared/types';
import { Errors } from '../errors';

export const sessionRouter = Router();
sessionRouter.use(authMiddleware);

sessionRouter.get(
  '/:userId',
  asyncHandler(async (req, res) => {
    const session = await sessionService.getSession(req.params.userId);
    if (!session) throw Errors.notFound('세션을 찾을 수 없습니다.');
    const body: SessionResponse = { session };
    res.json(body);
  }),
);
