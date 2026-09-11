/**
 * sessionService — 세션 상태 (make.md sequenceDiagram Step 1 세션 생성 / 에러 복구).
 * Redis SET session:{userId}. 재연결 시 GET /session/:userId로 상태 복구.
 */
import { Session, QueueState } from '../../../shared/types';
import { getRedis } from '../db/redis';

const redis = getRedis();
const key = (userId: string) => `session:${userId}`;

export async function createSession(userId: string): Promise<Session> {
  const existing = await getSession(userId);
  if (existing) return existing;
  const session: Session = {
    userId,
    trainId: null,
    queueState: null,
    selectedSeatId: null,
    bookingId: null,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(key(userId), JSON.stringify(session));
  return session;
}

export async function getSession(userId: string): Promise<Session | null> {
  const raw = await redis.get(key(userId));
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function updateSession(
  userId: string,
  patch: Partial<Omit<Session, 'userId' | 'updatedAt'>>,
): Promise<Session> {
  const current = (await getSession(userId)) ?? (await createSession(userId));
  const next: Session = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await redis.set(key(userId), JSON.stringify(next));
  return next;
}

export type { QueueState };
