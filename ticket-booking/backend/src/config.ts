/**
 * 환경변수 로더 (baseline #5: dev/staging/prod 분리)
 */
export interface AppConfig {
  env: string;
  port: number;
  wsPort: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  concurrentProcessingLimit: number;
  seatLockTtlSeconds: number;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
}

export const config: AppConfig = {
  env: process.env.APP_ENV ?? 'dev',
  port: num(process.env.PORT, 4000),
  wsPort: num(process.env.WS_PORT, 4001),
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-real-env',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'ticket',
    password: process.env.DB_PASSWORD ?? 'ticket',
    name: process.env.DB_NAME ?? 'ticket_booking',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: num(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  concurrentProcessingLimit: num(process.env.CONCURRENT_PROCESSING_LIMIT, 500),
  seatLockTtlSeconds: num(process.env.SEAT_LOCK_TTL_SECONDS, 300),
};
