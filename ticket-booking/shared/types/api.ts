/**
 * REST API 요청/응답 계약 - 단일 진실원 (baseline #4)
 * make.md §2 API 설계 기반
 */
import { Booking, QueueEntry, Seat, Session, Train } from './models';
import { QueueState } from './domain';

// ── 표준 에러 응답 (baseline #3 에러 응답 표준화) ──
export interface ApiError {
  error: {
    code: string; // 예: 'SEAT_LOCKED', 'QUEUE_NOT_READY'
    message: string; // 사용자 노출 메시지 (한국어)
    details?: unknown;
    traceId: string;
  };
}

export type ApiResult<T> = T | ApiError;

export function isApiError(v: unknown): v is ApiError {
  return typeof v === 'object' && v !== null && 'error' in v;
}

// ── POST /auth/login ──
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  token: string;
  userId: string;
}

// ── POST /queue/join ──
export interface JoinQueueRequest {
  trainId: string;
}
export interface JoinQueueResponse {
  queueNumber: number;
  estimatedWaitTime: number; // seconds
  state: QueueState;
}

// ── GET /queue/status/:userId ──
export interface QueueStatusResponse {
  queueNumber: number;
  peopleAhead: number;
  estimatedWaitTime: number;
  state: QueueState;
}

// ── DELETE /queue/leave ──
export interface LeaveQueueResponse {
  ok: true;
}

// ── GET /trains?from=&to=&date= ──
export interface TrainSearchResponse {
  trains: Train[];
  cached: boolean;
}

// ── GET /trains/:trainId/seats ──
export interface SeatMapResponse {
  trainId: string;
  seats: Seat[];
}

// ── POST /seat/select ──
export interface SelectSeatRequest {
  trainId: string;
  seatId: string;
}
export interface SelectSeatResponse {
  seatId: string;
  lockExpiresAt: string;
  state: 'LOCKED';
}

// ── POST /booking/confirm ──
export interface ConfirmBookingRequest {
  trainId: string;
  seatId: string;
}
export interface ConfirmBookingResponse {
  bookingNumber: string;
  bookingId: string;
}

// ── GET /booking/:bookingId ──
export interface BookingResponse {
  booking: Booking;
}

// ── DELETE /booking/:bookingId (예약 취소) ──
export interface CancelBookingResponse {
  ok: true;
  seatId: string;
  trainId: string;
}

// ── POST /auth/logout (토큰 무효화 + 세션 정리) ──
export interface LogoutResponse {
  ok: true;
}

// ── GET /session/:userId ──
export interface SessionResponse {
  session: Session;
}

// ── DELETE /session/:userId (세션 정리) ──
export interface ClearSessionResponse {
  ok: true;
}

// re-export
export type { Booking, QueueEntry, Seat, Session, Train };
