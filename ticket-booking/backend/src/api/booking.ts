/**
 * 예매 확정/조회 API (make.md sequenceDiagram Step 5, 6)
 * POST /booking/confirm, GET /booking/:bookingId, GET /booking/:bookingId/ticket
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import * as queueService from '../services/queueService';
import * as seatLockService from '../services/seatLockService';
import * as sessionService from '../services/sessionService';
import { getStore } from '../db/store';
import { broadcastSeatChanges } from '../websocket/server';
import {
  ConfirmBookingRequest,
  ConfirmBookingResponse,
  BookingResponse,
  QueueState,
} from '../../../shared/types';
import { Errors } from '../errors';

export const bookingRouter = Router();
bookingRouter.use(authMiddleware);
const store = getStore();

bookingRouter.post(
  '/confirm',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { trainId, seatId } = req.body as ConfirmBookingRequest;
    if (!trainId || !seatId) throw Errors.badRequest('trainId와 seatId가 필요합니다.');

    const { booking, change } = await seatLockService.confirmBooking(
      req.userId!,
      trainId,
      seatId,
    );
    await queueService.markCompleted(req.userId!, trainId);
    await sessionService.updateSession(req.userId!, {
      bookingId: booking.id,
      queueState: QueueState.COMPLETED,
    });

    // 모든 클라이언트 브로드캐스트 (baseline #7)
    broadcastSeatChanges(trainId, [change]);

    const body: ConfirmBookingResponse = {
      bookingNumber: booking.bookingNumber,
      bookingId: booking.id,
    };
    res.json(body);
  }),
);

bookingRouter.get(
  '/:bookingId',
  asyncHandler(async (req, res) => {
    const booking = await store.getBooking(req.params.bookingId);
    if (!booking) throw Errors.notFound('예매 내역을 찾을 수 없습니다.');
    const body: BookingResponse = { booking };
    res.json(body);
  }),
);

// 티켓 다운로드 (개발 단계: 이메일 대신 콘솔 로그 + 텍스트 응답)
bookingRouter.get(
  '/:bookingId/ticket',
  asyncHandler(async (req, res) => {
    const booking = await store.getBooking(req.params.bookingId);
    if (!booking) throw Errors.notFound('예매 내역을 찾을 수 없습니다.');
    // eslint-disable-next-line no-console
    console.log(`[email:dev] 티켓 발송 → 예매번호 ${booking.bookingNumber}`);
    res
      .type('text/plain')
      .send(
        `[기차표] 예매번호: ${booking.bookingNumber}\n열차: ${booking.trainId}\n좌석: ${booking.seatId}\n발급시각: ${booking.createdAt}`,
      );
  }),
);
