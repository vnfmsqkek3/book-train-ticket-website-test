/**
 * 대기순번 API (make.md §1, §2 대기열 관련 API)
 * POST /queue/join, GET /queue/status/:userId, DELETE /queue/leave
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import * as queueService from '../services/queueService';
import * as sessionService from '../services/sessionService';
import {
  JoinQueueRequest,
  JoinQueueResponse,
  QueueStatusResponse,
  LeaveQueueResponse,
} from '../../../shared/types';
import { Errors } from '../errors';

export const queueRouter = Router();
queueRouter.use(authMiddleware);

queueRouter.post(
  '/join',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { trainId } = req.body as JoinQueueRequest;
    if (!trainId) throw Errors.badRequest('trainId가 필요합니다.');
    const entry = await queueService.joinQueue(req.userId!, trainId);
    const info = await queueService.computeWaitInfo({
      userId: entry.userId,
      trainId: entry.trainId,
      queueNumber: entry.queueNumber,
      state: entry.state,
      joinedAt: entry.joinedAt,
      lastActivityAt: entry.lastActivityAt,
    });
    await sessionService.updateSession(req.userId!, {
      trainId,
      queueState: entry.state,
    });
    const body: JoinQueueResponse = {
      queueNumber: entry.queueNumber,
      estimatedWaitTime: info.estimatedWaitTime,
      state: entry.state,
    };
    res.json(body);
  }),
);

queueRouter.get(
  '/status/:userId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const trainId = String(req.query.trainId ?? '');
    if (!trainId) throw Errors.badRequest('trainId 쿼리가 필요합니다.');
    const entry = await queueService.getStatus(req.params.userId, trainId);
    const info = await queueService.computeWaitInfo({
      userId: entry.userId,
      trainId: entry.trainId,
      queueNumber: entry.queueNumber,
      state: entry.state,
      joinedAt: entry.joinedAt,
      lastActivityAt: entry.lastActivityAt,
    });
    const body: QueueStatusResponse = {
      queueNumber: entry.queueNumber,
      peopleAhead: info.peopleAhead,
      estimatedWaitTime: info.estimatedWaitTime,
      state: entry.state,
    };
    res.json(body);
  }),
);

queueRouter.delete(
  '/leave',
  asyncHandler(async (req: AuthedRequest, res) => {
    const trainId = String(req.query.trainId ?? req.body?.trainId ?? '');
    if (!trainId) throw Errors.badRequest('trainId가 필요합니다.');
    await queueService.leaveQueue(req.userId!, trainId);
    const body: LeaveQueueResponse = { ok: true };
    res.json(body);
  }),
);
