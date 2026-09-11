/**
 * 백그라운드 스케줄러 (make.md sequenceDiagram 대기 상태 실시간 업데이트 / TTL 만료).
 *
 * 1초 주기로:
 *  - 각 열차의 대기열 tick() → WAITING 상위 N명을 READY로 전이, 브로드캐스트
 *  - 만료된 좌석 잠금 정리(reapExpiredLocks) → 해제 좌석 브로드캐스트
 */
import { QUEUE_TICK_INTERVAL_MS, ServerEventType } from '../../shared/types';
import * as queueService from './services/queueService';
import * as seatLockService from './services/seatLockService';
import { TRAINS } from './data/seed';
import { broadcastSeatChanges, sendToUser } from './websocket/server';

let timer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runTick();
  }, QUEUE_TICK_INTERVAL_MS);
  // eslint-disable-next-line no-console
  console.log(`[scheduler] 시작 (주기 ${QUEUE_TICK_INTERVAL_MS}ms)`);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function runTick(): Promise<void> {
  for (const train of TRAINS) {
    try {
      // 1) 대기열 진행: READY로 승격된 사용자에게 개별 통지
      const promoted = await queueService.tick(train.id);
      for (const e of promoted) {
        const info = await queueService.computeWaitInfo(e);
        sendToUser(e.userId, {
          type: ServerEventType.QUEUE_UPDATE,
          queueNumber: e.queueNumber,
          peopleAhead: info.peopleAhead,
          estimatedWaitTime: info.estimatedWaitTime,
          state: e.state,
        });
      }

      // 2) 만료된 좌석 잠금 정리 → 브로드캐스트
      const released = await seatLockService.reapExpiredLocks(train.id);
      broadcastSeatChanges(train.id, released);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[scheduler] tick 오류:', (err as Error).message);
    }
  }
}
