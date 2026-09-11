/**
 * 좌석 예매 API (make.md sequenceDiagram Step 4)
 * POST /seat/select
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import * as queueService from '../services/queueService';
import * as seatLockService from '../services/seatLockService';
import * as sessionService from '../services/sessionService';
import { broadcastSeatChanges } from '../websocket/server';
import { SelectSeatRequest, SelectSeatResponse, QueueState } from '../../../shared/types';
import { Errors } from '../errors';

export const seatRouter = Router();
seatRouter.use(authMiddleware);

seatRouter.post(
  '/select',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { trainId, seatId } = req.body as SelectSeatRequest;
    if (!trainId || !seatId) throw Errors.badRequest('trainId와 seatId가 필요합니다.');

    // 예매 가능 순번 가드 (baseline #6 + 대기열 상태 머신)
    await queueService.assertCanSelectSeat(req.userId!, trainId);
    await queueService.markProcessing(req.userId!, trainId);

    const { lockExpiresAt, change } = await seatLockService.lockSeat(
      req.userId!,
      trainId,
      seatId,
    );
    await sessionService.updateSession(req.userId!, {
      selectedSeatId: seatId,
      queueState: QueueState.PROCESSING,
    });

    // 다른 사용자 UI 갱신 (baseline #7)
    broadcastSeatChanges(trainId, [change]);

    const body: SelectSeatResponse = {
      seatId,
      lockExpiresAt,
      state: 'LOCKED',
    };
    res.json(body);
  }),
);
