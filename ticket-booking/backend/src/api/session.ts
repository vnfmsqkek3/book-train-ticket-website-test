/**
 * 세션 API (make.md sequenceDiagram 에러 복구 — 재연결 후 상태 복구)
 * GET /session/:userId, DELETE /session/:userId (세션 정리)
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import * as sessionService from '../services/sessionService';
import { SessionResponse, ClearSessionResponse } from '../../../shared/types';
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

// 세션 정리 (본인만). 토큰 자체는 유지하되 서버 세션 상태를 제거.
sessionRouter.delete(
  '/:userId',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.userId !== req.params.userId) {
      throw Errors.unauthorized('본인의 세션만 정리할 수 있습니다.');
    }
    await sessionService.clearSession(req.params.userId);
    const body: ClearSessionResponse = { ok: true };
    res.json(body);
  }),
);
