/**
 * 도메인 상태 enum 및 전이 규칙 - 단일 진실원 (baseline #4)
 *
 * 프론트엔드/백엔드가 동일한 타입을 공유하여 API 계약 불일치를 방지한다.
 */

// ─────────────────────────────────────────────────────────────
// 대기열 상태 머신 (make.md §4 대기열 상태 전이)
// ─────────────────────────────────────────────────────────────
export enum QueueState {
  WAITING = 'WAITING', // 대기 중
  READY = 'READY', // 예매 가능
  PROCESSING = 'PROCESSING', // 진행 중 (좌석 선택 중)
  COMPLETED = 'COMPLETED', // 완료
  TIMEOUT = 'TIMEOUT', // 타임아웃 (5분 미응답)
  CANCELLED = 'CANCELLED', // 사용자 취소
}

/**
 * 허용된 상태 전이 테이블.
 * 여기에 정의되지 않은 전이는 guard에서 차단된다.
 * (예: COMPLETED → PROCESSING 은 불허)
 */
export const QUEUE_TRANSITIONS: Record<QueueState, QueueState[]> = {
  [QueueState.WAITING]: [QueueState.READY, QueueState.TIMEOUT, QueueState.CANCELLED],
  [QueueState.READY]: [QueueState.PROCESSING, QueueState.TIMEOUT, QueueState.CANCELLED],
  [QueueState.PROCESSING]: [QueueState.COMPLETED, QueueState.TIMEOUT, QueueState.CANCELLED],
  [QueueState.COMPLETED]: [], // 종료 상태
  [QueueState.TIMEOUT]: [], // 종료 상태
  [QueueState.CANCELLED]: [], // 종료 상태
};

export const QUEUE_TERMINAL_STATES: QueueState[] = [
  QueueState.COMPLETED,
  QueueState.TIMEOUT,
  QueueState.CANCELLED,
];

/** 전이 가드: from → to 전이가 허용되는지 검사 */
export function canTransitionQueue(from: QueueState, to: QueueState): boolean {
  return QUEUE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─────────────────────────────────────────────────────────────
// 좌석 상태 머신 (make.md §4 좌석 데이터)
// ─────────────────────────────────────────────────────────────
export enum SeatState {
  AVAILABLE = 'AVAILABLE', // 가용
  LOCKED = 'LOCKED', // 임시예약 (TTL 잠금)
  SOLD = 'SOLD', // 판매 완료
}

export const SEAT_TRANSITIONS: Record<SeatState, SeatState[]> = {
  [SeatState.AVAILABLE]: [SeatState.LOCKED],
  [SeatState.LOCKED]: [SeatState.SOLD, SeatState.AVAILABLE], // 확정 또는 만료/해제
  [SeatState.SOLD]: [SeatState.AVAILABLE], // 예약 취소 시 다시 가용 (빈자리 발생)
};

export function canTransitionSeat(from: SeatState, to: SeatState): boolean {
  return SEAT_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─────────────────────────────────────────────────────────────
// 상수 (make.md 전반)
// ─────────────────────────────────────────────────────────────
export const SEAT_LOCK_TTL_SECONDS = 300; // 5분 TTL 임시 예약
export const CONCURRENT_PROCESSING_LIMIT = 500; // 동시 좌석 선택 한계
export const QUEUE_TICK_INTERVAL_MS = 1000; // 대기 상태 브로드캐스트 주기 (1초)
export const TRAINS_CACHE_TTL_SECONDS = 3600; // 열차 목록 캐시 1시간
export const ESTIMATED_SECONDS_PER_USER = 30; // 대기 예상시간 계산용
