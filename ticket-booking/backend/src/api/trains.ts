/**
 * 열차/좌석 조회 API (make.md sequenceDiagram Step 3)
 * GET /trains?from=&to=&date=, GET /trains/:trainId/seats
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import * as trainService from '../services/trainService';
import * as seatLockService from '../services/seatLockService';
import { TrainSearchResponse, SeatMapResponse } from '../../../shared/types';

export const trainRouter = Router();
trainRouter.use(authMiddleware);

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
