/**
 * Express 앱 구성 (baseline #3: services 계층 강제 + 에러 표준화)
 * 라우터는 services만 호출하며, 비즈니스 로직을 직접 포함하지 않는다.
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './api/auth';
import { queueRouter } from './api/queue';
import { trainRouter } from './api/trains';
import { seatRouter } from './api/seats';
import { bookingRouter } from './api/booking';
import { sessionRouter } from './api/session';
import { isRedisFallback } from './db/redis';
import { isDbFallback } from './db/store';
import { connectedCount } from './websocket/server';

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // 헬스체크 (ALB target group + 모니터링용)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      redis: isRedisFallback() ? 'fallback' : 'connected',
      db: isDbFallback() ? 'fallback' : 'connected',
      wsClients: connectedCount(),
      time: new Date().toISOString(),
    });
  });

  app.use('/auth', authRouter);
  app.use('/queue', queueRouter);
  app.use('/trains', trainRouter);
  app.use('/seat', seatRouter);
  app.use('/booking', bookingRouter);
  app.use('/session', sessionRouter);

  // 에러 표준화 미들웨어 (반드시 마지막)
  app.use(errorHandler);
  return app;
}
