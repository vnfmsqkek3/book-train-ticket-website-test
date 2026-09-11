/**
 * 서버 진입점.
 * - 좌석 시드 로드
 * - HTTP(Express) + WebSocket 서버 기동
 * - 백그라운드 스케줄러 시작
 */
import { createApp } from './app';
import { config } from './config';
import { getStore } from './db/store';
import { allSeeds } from './data/seed';
import { createWebSocketServer } from './websocket/server';
import { startScheduler } from './scheduler';

async function main(): Promise<void> {
  // 스키마 자동 생성 후 좌석 시드 (make.md §4 좌석 데이터)
  await getStore().migrate();
  await getStore().seedSeats(allSeeds());

  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[http] REST API 실행 중: http://localhost:${config.port} (env=${config.env})`);
  });

  createWebSocketServer(config.wsPort);
  startScheduler();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('서버 기동 실패:', err);
  process.exit(1);
});
