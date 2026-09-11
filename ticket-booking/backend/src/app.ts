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

  // 라우터를 루트와 /api 프리픽스 양쪽에 마운트.
  // CloudFront가 /api/* 를 ALB로 포워딩(경로 유지)하므로 /api 프리픽스가 필요하고,
  // ALB 직접 접근(헬스체크 등)을 위해 루트 경로도 유지한다.
  const mount = (base: string) => {
    app.use(`${base}/auth`, authRouter);
    app.use(`${base}/queue`, queueRouter);
    app.use(`${base}/trains`, trainRouter);
    app.use(`${base}/seat`, seatRouter);
    app.use(`${base}/booking`, bookingRouter);
    app.use(`${base}/session`, sessionRouter);
  };
  mount('');
  mount('/api');

  // 에러 표준화 미들웨어 (반드시 마지막)
  app.use(errorHandler);
  return app;
}
