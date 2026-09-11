/**
 * 상태 머신 전이 가드 단위 테스트 (make.md 구조 패턴: guard로 잘못된 전이 차단)
 */
import {
  QueueState,
  SeatState,
  canTransitionQueue,
  canTransitionSeat,
} from '../../../shared/types';

describe('대기열 상태 전이 가드', () => {
  it('허용된 전이: WAITING → READY → PROCESSING → COMPLETED', () => {
    expect(canTransitionQueue(QueueState.WAITING, QueueState.READY)).toBe(true);
    expect(canTransitionQueue(QueueState.READY, QueueState.PROCESSING)).toBe(true);
    expect(canTransitionQueue(QueueState.PROCESSING, QueueState.COMPLETED)).toBe(true);
  });

  it('차단된 전이: COMPLETED → PROCESSING (역행 불가)', () => {
    expect(canTransitionQueue(QueueState.COMPLETED, QueueState.PROCESSING)).toBe(false);
  });

  it('차단된 전이: WAITING → COMPLETED (단계 건너뜀 불가)', () => {
    expect(canTransitionQueue(QueueState.WAITING, QueueState.COMPLETED)).toBe(false);
  });

  it('타임아웃/취소는 대부분 상태에서 허용', () => {
    expect(canTransitionQueue(QueueState.WAITING, QueueState.TIMEOUT)).toBe(true);
    expect(canTransitionQueue(QueueState.READY, QueueState.CANCELLED)).toBe(true);
    expect(canTransitionQueue(QueueState.PROCESSING, QueueState.TIMEOUT)).toBe(true);
  });

  it('종료 상태에서는 어떤 전이도 불가', () => {
    expect(canTransitionQueue(QueueState.TIMEOUT, QueueState.WAITING)).toBe(false);
    expect(canTransitionQueue(QueueState.CANCELLED, QueueState.READY)).toBe(false);
  });
});

describe('좌석 상태 전이 가드', () => {
  it('허용: AVAILABLE → LOCKED → SOLD', () => {
    expect(canTransitionSeat(SeatState.AVAILABLE, SeatState.LOCKED)).toBe(true);
    expect(canTransitionSeat(SeatState.LOCKED, SeatState.SOLD)).toBe(true);
  });

  it('허용: LOCKED → AVAILABLE (만료/해제)', () => {
    expect(canTransitionSeat(SeatState.LOCKED, SeatState.AVAILABLE)).toBe(true);
  });

  it('허용: SOLD → AVAILABLE (예약 취소로 빈자리 발생)', () => {
    expect(canTransitionSeat(SeatState.SOLD, SeatState.AVAILABLE)).toBe(true);
  });

  it('차단: SOLD → LOCKED (취소 없이 바로 잠금 불가)', () => {
    expect(canTransitionSeat(SeatState.SOLD, SeatState.LOCKED)).toBe(false);
  });

  it('차단: AVAILABLE → SOLD (잠금 없이 판매 불가)', () => {
    expect(canTransitionSeat(SeatState.AVAILABLE, SeatState.SOLD)).toBe(false);
  });
});
