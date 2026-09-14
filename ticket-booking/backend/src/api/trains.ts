/**
 * 열차/좌석 조회 API (make.md sequenceDiagram Step 3)
 * GET /trains?from=&to=&date=, GET /trains/:trainId/seats
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import * as trainService from '../services/trainService';
import * as seatLockService from '../services/seatLockService';
import { bookableDates, DEPARTURE_HOURS, routeList, BOOT_BASE } from '../data/seed';
import {
  TrainSearchResponse,
  SeatMapResponse,
  TrainsMetaResponse,
} from '../../../shared/types';

export const trainRouter = Router();
trainRouter.use(authMiddleware);

// 예약 가능 날짜(시스템 기준 7일)/시간대(06~23)/노선 메타
trainRouter.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const body: TrainsMetaResponse = {
      dates: bookableDates(BOOT_BASE),
      hours: DEPARTURE_HOURS,
      routes: routeList(),
    };
    res.json(body);
  }),
);

trainRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to, date } = req.query as Record<string, string>;
    const { trains, cached } = await trainService.searchTrains(from, to, date);
    const body: TrainSearchResponse = { trains, cached };
    res.json(body);
  }),
);

trainRouter.get(
  '/:trainId/seats',
  asyncHandler(async (req, res) => {
    const seats = await seatLockService.getSeatMap(req.params.trainId);
    const body: SeatMapResponse = { trainId: req.params.trainId, seats };
    res.json(body);
  }),
);
