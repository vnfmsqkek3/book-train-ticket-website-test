/**
 * seatLockService — 좌석 잠금 메커니즘 (make.md §2 하이브리드 전략, baseline #6)
 *
 * 하이브리드 다단계 전략:
 *  1) 좌석 선택 시 Redis SET(TTL 5분)으로 임시 예약 → 다른 사용자 선택 차단 (baseline #6)
 *  2) 예매 확정 시 DB Optimistic Lock(version) 검증 → 최종 커밋 (make.md sequenceDiagram Step 5)
 *
 * 좌석 상태 전이는 canTransitionSeat 가드로 차단:
 *   AVAILABLE → LOCKED → SOLD (정상)
 *   LOCKED → AVAILABLE (TTL 만료/해제)
 */
import { randomUUID } from 'crypto';
import {
  Seat,
  SeatState,
  canTransitionSeat,
  SEAT_LOCK_TTL_SECONDS,
  Booking,
} from '../../../shared/types';
import { getRedis } from '../db/redis';
import { getStore } from '../db/store';
import { config } from '../config';
import { Errors } from '../errors';

const redis = getRedis();
const store = getStore();

const lockKey = (trainId: string, seatId: string) => `seat:lock:${trainId}:${seatId}`;

export interface SeatChange {
  seatId: string;
  state: SeatState;
  ownerId: string | null;
}

/**
 * 좌석 임시 잠금 (make.md sequenceDiagram Step 4).
 * Redis SET(TTL)로 원자적 선점 + DB 상태를 LOCKED로 갱신.
 * @returns 잠금 만료 시각(ISO)
 */
export async function lockSeat(
  userId: string,
  trainId: string,
  seatId: string,
): Promise<{ lockExpiresAt: string; change: SeatChange }> {
  const seat = await store.getSeat(trainId, seatId);
  if (!seat) throw Errors.notFound('좌석을 찾을 수 없습니다.');

  if (seat.state === SeatState.SOLD) throw Errors.seatSold();

  // Redis 잠금 소유권 확인: 다른 사용자가 잠근 상태면 차단 (baseline #6)
  const currentLock = await redis.get(lockKey(trainId, seatId));
  if (currentLock && currentLock !== userId) {
    throw Errors.seatLocked();
  }

  if (seat.state === SeatState.LOCKED && seat.ownerId && seat.ownerId !== userId) {
    throw Errors.seatLocked();
  }

  if (!canTransitionSeat(seat.state, SeatState.LOCKED) && seat.state !== SeatState.LOCKED) {
    throw Errors.invalidTransition(`좌석 전이 불가: ${seat.state} → LOCKED`);
  }

  const ttl = config.seatLockTtlSeconds || SEAT_LOCK_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  // Redis 원자적 선점 (TTL)
  await redis.set(lockKey(trainId, seatId), userId, ttl);

  // DB 상태 갱신 (Optimistic Lock 버전 검증)
  const ok = await store.updateSeatWithVersion(trainId, seatId, seat.version, {
    state: SeatState.LOCKED,
    ownerId: userId,
    lockExpiresAt: expiresAt,
  });
  if (!ok) {
    // 버전 충돌 → 다른 트랜잭션이 먼저 점유
    await redis.del(lockKey(trainId, seatId));
    throw Errors.seatVersionConflict();
  }

  return {
    lockExpiresAt: expiresAt,
    change: { seatId, state: SeatState.LOCKED, ownerId: userId },
  };
}

/**
 * 예매 확정 (make.md sequenceDiagram Step 5).
 * Optimistic Lock 검증 후 LOCKED → SOLD 전이 + 예매 기록 INSERT.
 */
export async function confirmBooking(
  userId: string,
  trainId: string,
  seatId: string,
): Promise<{ booking: Booking; change: SeatChange }> {
  const seat = await store.getSeat(trainId, seatId);
  if (!seat) throw Errors.notFound('좌석을 찾을 수 없습니다.');
  if (seat.state === SeatState.SOLD) throw Errors.seatSold();

  // 잠금 소유권 검증 (baseline #6)
  if (seat.ownerId !== userId) throw Errors.seatLocked();
  const currentLock = await redis.get(lockKey(trainId, seatId));
  if (currentLock !== userId) {
    // TTL 만료됨
    throw Errors.invalidTransition('좌석 잠금이 만료되었습니다. 다시 선택해 주세요.');
  }

  if (!canTransitionSeat(seat.state, SeatState.SOLD)) {
    throw Errors.invalidTransition(`좌석 전이 불가: ${seat.state} → SOLD`);
  }

  // Optimistic Lock: 버전 일치 시에만 SOLD 커밋
  const ok = await store.updateSeatWithVersion(trainId, seatId, seat.version, {
    state: SeatState.SOLD,
    ownerId: userId,
    lockExpiresAt: null,
  });
  if (!ok) throw Errors.seatVersionConflict();

  await redis.del(lockKey(trainId, seatId));

  const booking: Booking = {
    id: randomUUID(),
    bookingNumber: genBookingNumber(),
    userId,
    trainId,
    seatId,
    createdAt: new Date().toISOString(),
    ticketDownloadUrl: '', // 아래서 채움
  };
  booking.ticketDownloadUrl = `/api/booking/${booking.id}/ticket`;
  await store.insertBooking(booking);

  return {
    booking,
    change: { seatId, state: SeatState.SOLD, ownerId: userId },
  };
}

/**
 * 예약 취소 (신규). 판매 완료(SOLD)된 좌석을 다시 가용 상태로 되돌려 빈자리를 만든다.
 * - 예매 소유자만 취소 가능
 * - SOLD → AVAILABLE 전이 (Optimistic Lock version CAS)
 * - 예매 기록 삭제
 * @returns 좌석 변경 정보 (WebSocket 브로드캐스트용)
 */
export async function cancelBooking(
  userId: string,
  bookingId: string,
): Promise<{ trainId: string; change: SeatChange }> {
  const booking = await store.getBooking(bookingId);
  if (!booking) throw Errors.notFound('예매 내역을 찾을 수 없습니다.');
  if (booking.userId !== userId) {
    throw Errors.unauthorized('본인의 예매만 취소할 수 있습니다.');
  }

  const { trainId, seatId } = booking;
  const seat = await store.getSeat(trainId, seatId);
  if (!seat) throw Errors.notFound('좌석을 찾을 수 없습니다.');

  // SOLD 상태에서만 취소 가능 (가드)
  if (seat.state !== SeatState.SOLD) {
    throw Errors.invalidTransition(`예약 취소 불가: 좌석 상태가 ${seat.state}입니다.`);
  }
  if (!canTransitionSeat(seat.state, SeatState.AVAILABLE)) {
    throw Errors.invalidTransition(`좌석 전이 불가: ${seat.state} → AVAILABLE`);
  }

  // SOLD → AVAILABLE (Optimistic Lock). 빈자리 발생.
  const ok = await store.updateSeatWithVersion(trainId, seatId, seat.version, {
    state: SeatState.AVAILABLE,
    ownerId: null,
    lockExpiresAt: null,
  });
  if (!ok) throw Errors.seatVersionConflict();

  // 잔여 Redis 잠금이 있으면 제거 (방어적)
  await redis.del(lockKey(trainId, seatId));

  // 예매 기록 삭제
  await store.deleteBooking(bookingId);

  return {
    trainId,
    change: { seatId, state: SeatState.AVAILABLE, ownerId: null },
  };
}

/**
 * 좌석 잠금 해제 (make.md sequenceDiagram 타임아웃/취소).
 * LOCKED → AVAILABLE 전이.
 */
export async function releaseSeat(
  userId: string,
  trainId: string,
  seatId: string,
): Promise<SeatChange | null> {
  const seat = await store.getSeat(trainId, seatId);
  if (!seat || seat.state !== SeatState.LOCKED) return null;
  if (seat.ownerId !== userId) return null;

  const ok = await store.updateSeatWithVersion(trainId, seatId, seat.version, {
    state: SeatState.AVAILABLE,
    ownerId: null,
    lockExpiresAt: null,
  });
  if (!ok) return null;
  await redis.del(lockKey(trainId, seatId));
  return { seatId, state: SeatState.AVAILABLE, ownerId: null };
}

/**
 * 만료된 잠금 정리 (make.md sequenceDiagram TTL 만료 이벤트).
 * DB의 LOCKED 좌석 중 Redis 잠금이 사라진(TTL 만료) 좌석을 AVAILABLE로 되돌린다.
 * 타이머에서 주기적으로 호출.
 * @returns 해제된 좌석 변경 목록 (브로드캐스트용)
 */
export async function reapExpiredLocks(trainId: string): Promise<SeatChange[]> {
  const seats = await store.getSeats(trainId);
  const changes: SeatChange[] = [];
  for (const seat of seats) {
    if (seat.state !== SeatState.LOCKED) continue;
    const lock = await redis.get(lockKey(trainId, seat.seatId));
    const expired =
      !lock ||
      (seat.lockExpiresAt !== null && Date.now() >= Date.parse(seat.lockExpiresAt));
    if (expired) {
      const ok = await store.updateSeatWithVersion(trainId, seat.seatId, seat.version, {
        state: SeatState.AVAILABLE,
        ownerId: null,
        lockExpiresAt: null,
      });
      if (ok) {
        await redis.del(lockKey(trainId, seat.seatId));
        changes.push({ seatId: seat.seatId, state: SeatState.AVAILABLE, ownerId: null });
      }
    }
  }
  return changes;
}

export async function getSeatMap(trainId: string): Promise<Seat[]> {
  return store.getSeats(trainId);
}

function genBookingNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate(),
  ).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BK${ymd}-${rand}`;
}
