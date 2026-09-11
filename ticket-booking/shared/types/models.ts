/**
 * 도메인 엔티티 모델 - 단일 진실원 (baseline #4)
 */
import { QueueState, SeatState } from './domain';

export interface User {
  id: string;
  email: string;
  phone?: string;
  priority: 'VIP' | 'NORMAL'; // make.md §4 우선순위 예외 정책
}

export interface Train {
  id: string;
  name: string; // 예: KTX 101
  from: string; // 출발지
  to: string; // 도착지
  departureDate: string; // ISO date (YYYY-MM-DD)
  departureTime: string; // HH:mm
  totalSeats: number;
}

export interface Seat {
  seatId: string; // 좌석번호 (예: "3A")
  trainId: string;
  state: SeatState;
  ownerId: string | null; // 임시예약자 또는 구매자
  version: number; // Optimistic Lock 버전
  lockExpiresAt: string | null; // ISO timestamp
  position: {
    row: number;
    col: string; // A~F
    type: 'WINDOW' | 'AISLE' | 'MIDDLE'; // 창가/복도 필터링용
  };
}

export interface QueueEntry {
  userId: string;
  trainId: string;
  queueNumber: number;
  state: QueueState;
  joinedAt: string; // ISO timestamp
  lastActivityAt: string;
  estimatedWaitTime: number; // seconds
}

export interface Booking {
  id: string;
  bookingNumber: string; // 사용자 노출용 예매번호
  userId: string;
  trainId: string;
  seatId: string;
  createdAt: string;
  ticketDownloadUrl: string;
}

export interface Session {
  userId: string;
  trainId: string | null;
  queueState: QueueState | null;
  selectedSeatId: string | null;
  bookingId: string | null;
  updatedAt: string;
}
