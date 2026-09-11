/**
 * WebSocket 이벤트 타입 - 단일 진실원 (baseline #4, #7)
 * make.md §2 WebSocket 이벤트 타입 기반
 */
import { QueueState, SeatState } from './domain';

// ── 클라이언트 → 서버 ──
export enum ClientEventType {
  JOIN_QUEUE = 'JOIN_QUEUE',
  SELECT_SEAT = 'SELECT_SEAT',
  CONFIRM_BOOKING = 'CONFIRM_BOOKING',
  HEARTBEAT = 'HEARTBEAT',
}

export interface JoinQueueEvent {
  type: ClientEventType.JOIN_QUEUE;
  trainId: string;
}
export interface SelectSeatEvent {
  type: ClientEventType.SELECT_SEAT;
  trainId: string;
  seatId: string;
}
export interface ConfirmBookingEvent {
  type: ClientEventType.CONFIRM_BOOKING;
  trainId: string;
  seatId: string;
}
export interface HeartbeatEvent {
  type: ClientEventType.HEARTBEAT;
}

export type ClientEvent =
  | JoinQueueEvent
  | SelectSeatEvent
  | ConfirmBookingEvent
  | HeartbeatEvent;

// ── 서버 → 클라이언트 ──
export enum ServerEventType {
  QUEUE_UPDATE = 'QUEUE_UPDATE',
  SEAT_STATUS = 'SEAT_STATUS',
  BOOKING_RESULT = 'BOOKING_RESULT',
  ERROR = 'ERROR',
}

export interface QueueUpdateEvent {
  type: ServerEventType.QUEUE_UPDATE;
  queueNumber: number;
  peopleAhead: number;
  estimatedWaitTime: number;
  state: QueueState;
}

/** diff 기반 좌석 상태 브로드캐스트 (변경된 좌석만) */
export interface SeatStatusEvent {
  type: ServerEventType.SEAT_STATUS;
  trainId: string;
  changes: Array<{
    seatId: string;
    state: SeatState;
    ownerId: string | null;
  }>;
}

export interface BookingResultEvent {
  type: ServerEventType.BOOKING_RESULT;
  success: boolean;
  bookingNumber?: string;
  seatId: string;
}

export interface ServerErrorEvent {
  type: ServerEventType.ERROR;
  code: string;
  message: string;
}

export type ServerEvent =
  | QueueUpdateEvent
  | SeatStatusEvent
  | BookingResultEvent
  | ServerErrorEvent;
