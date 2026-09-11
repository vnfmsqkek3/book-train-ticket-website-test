/**
 * queueService — 대기열 상태 머신 처리 (make.md §1, §4)
 *
 * 상태: WAITING → READY → PROCESSING → COMPLETED / TIMEOUT / CANCELLED
 * - Redis 원자적 INCR로 중복 없는 순번 발급 (동시성 제어)
 * - 타이머(1초 주기)가 WAITING 상위 N명을 READY로 전이 (동시 처리 한계)
 * - 잘못된 전이는 canTransitionQueue 가드로 차단
 */
import { randomUUID } from 'crypto';
import {
  QueueState,
  QueueEntry,
  canTransitionQueue,
  QUEUE_TERMINAL_STATES,
  ESTIMATED_SECONDS_PER_USER,
} from '../../../shared/types';
import { getRedis } from '../db/redis';
import { getStore } from '../db/store';
import { config } from '../config';
import { Errors } from '../errors';

const redis = getRedis();
const store = getStore();

// Redis 키 규칙 (make.md §4 Redis 대기열 구조)
const counterKey = (trainId: string) => `queue:counter:${trainId}`;
const processedKey = (trainId: string) => `queue:processed:${trainId}`; // 현재 처리 순번
const entryKey = (userId: string, trainId: string) => `queue:entry:${userId}:${trainId}`;

interface StoredEntry {
  userId: string;
  trainId: string;
  queueNumber: number;
  state: QueueState;
  joinedAt: string;
  lastActivityAt: string;
}

async function loadEntry(userId: string, trainId: string): Promise<StoredEntry | null> {
  const raw = await redis.get(entryKey(userId, trainId));
  return raw ? (JSON.parse(raw) as StoredEntry) : null;
}

async function saveEntry(e: StoredEntry): Promise<void> {
  await redis.set(entryKey(e.userId, e.trainId), JSON.stringify(e));
}

/** 상태 전이 (가드 강제). 허용되지 않은 전이는 예외 발생. */
export async function transition(
  userId: string,
  trainId: string,
  to: QueueState,
  reason?: string,
): Promise<StoredEntry> {
  const e = await loadEntry(userId, trainId);
  if (!e) throw Errors.notFound('대기열 항목을 찾을 수 없습니다.');
  if (e.state === to) return e; // idempotent

  if (!canTransitionQueue(e.state, to)) {
    throw Errors.invalidTransition(
      `잘못된 대기열 상태 전이입니다: ${e.state} → ${to}`,
    );
  }

  e.state = to;
  e.lastActivityAt = new Date().toISOString();
  await saveEntry(e);

  // 종료 상태는 영속 기록 (make.md §4 queue_history)
  if (QUEUE_TERMINAL_STATES.includes(to)) {
    await store.insertQueueHistory({
      id: randomUUID(),
      userId: e.userId,
      trainId: e.trainId,
      queueNumber: e.queueNumber,
      joinedAt: e.joinedAt,
      exitedAt: e.lastActivityAt,
      status: to,
      reason: reason ?? null,
    });
  }
  return e;
}

/** 대기열 입장 — 원자적 INCR로 순번 발급 (make.md sequenceDiagram Step 2) */
export async function joinQueue(
  userId: string,
  trainId: string,
): Promise<QueueEntry> {
  const existing = await loadEntry(userId, trainId);
  if (existing && !QUEUE_TERMINAL_STATES.includes(existing.state)) {
    return toQueueEntry(existing);
  }

  const queueNumber = await redis.incr(counterKey(trainId));
  const now = new Date().toISOString();
  const entry: StoredEntry = {
    userId,
    trainId,
    queueNumber,
    state: QueueState.WAITING,
    joinedAt: now,
    lastActivityAt: now,
  };
  await saveEntry(entry);
  return toQueueEntry(entry);
}

/** 대기열 상태 조회 (make.md §1 대기열 상태 조회) */
export async function getStatus(
  userId: string,
  trainId: string,
): Promise<QueueEntry> {
  const e = await loadEntry(userId, trainId);
  if (!e) throw Errors.notFound('대기열 항목을 찾을 수 없습니다.');
  return toQueueEntry(e);
}

/** 사용자 취소 (make.md §4 CANCELLED) */
export async function leaveQueue(userId: string, trainId: string): Promise<void> {
  await transition(userId, trainId, QueueState.CANCELLED, 'user_cancelled');
}

/** 좌석 선택 시작 시 READY → PROCESSING */
export async function markProcessing(userId: string, trainId: string): Promise<void> {
  await transition(userId, trainId, QueueState.PROCESSING, 'seat_selection');
}

/** 예매 확정 시 PROCESSING → COMPLETED */
export async function markCompleted(userId: string, trainId: string): Promise<void> {
  await transition(userId, trainId, QueueState.COMPLETED, 'booking_confirmed');
}

async function currentProcessedNumber(trainId: string): Promise<number> {
  const v = await redis.get(processedKey(trainId));
  return v ? Number(v) : 0;
}

function toQueueEntry(e: StoredEntry): QueueEntry {
  return {
    userId: e.userId,
    trainId: e.trainId,
    queueNumber: e.queueNumber,
    state: e.state,
    joinedAt: e.joinedAt,
    lastActivityAt: e.lastActivityAt,
    estimatedWaitTime: 0, // computeWaitInfo에서 산출
  };
}

/** 순번 기반 대기 정보 계산 (앞 사람 수, 예상시간) */
export async function computeWaitInfo(
  e: StoredEntry,
): Promise<{ peopleAhead: number; estimatedWaitTime: number }> {
  const processed = await currentProcessedNumber(e.trainId);
  const peopleAhead = Math.max(0, e.queueNumber - processed - 1);
  return {
    peopleAhead,
    estimatedWaitTime: peopleAhead * ESTIMATED_SECONDS_PER_USER,
  };
}

/**
 * 대기열 진행 틱 (1초 주기 타이머에서 호출).
 * WAITING 상태 중 순번이 도달한 상위 N명(동시 처리 한계)을 READY로 전이.
 * @returns READY로 전이된 사용자 목록 (WebSocket 브로드캐스트용)
 */
export async function tick(trainId: string): Promise<StoredEntry[]> {
  const limit = config.concurrentProcessingLimit;

  // 현재 활성(비종료) 항목 로드
  const keys = await redis.keys(`queue:entry:*:${trainId}`);
  const entries: StoredEntry[] = [];
  for (const k of keys) {
    const raw = await redis.get(k);
    if (raw) entries.push(JSON.parse(raw) as StoredEntry);
  }

  const active = entries.filter((e) => !QUEUE_TERMINAL_STATES.includes(e.state));
  const processing = active.filter(
    (e) => e.state === QueueState.READY || e.state === QueueState.PROCESSING,
  ).length;

  const waiting = active
    .filter((e) => e.state === QueueState.WAITING)
    .sort((a, b) => a.queueNumber - b.queueNumber);

  const slots = Math.max(0, limit - processing);
  const promoted: StoredEntry[] = [];
  for (const e of waiting.slice(0, slots)) {
    e.state = QueueState.READY;
    e.lastActivityAt = new Date().toISOString();
    await saveEntry(e);
    // 처리 순번 갱신
    await redis.set(processedKey(trainId), String(e.queueNumber));
    promoted.push(e);
  }
  return promoted;
}

/** WAITING/READY 상태에서 예매 가능 여부 가드 (좌석 선택 진입 조건) */
export async function assertCanSelectSeat(userId: string, trainId: string): Promise<void> {
  const e = await loadEntry(userId, trainId);
  if (!e) throw Errors.notFound('대기열 항목을 찾을 수 없습니다.');
  if (e.state !== QueueState.READY && e.state !== QueueState.PROCESSING) {
    throw Errors.queueNotReady();
  }
}
