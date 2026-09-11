/**
 * 타입 세이프 API 클라이언트 (shared/types 재사용 — baseline #4)
 */
import type {
  LoginRequest,
  LoginResponse,
  JoinQueueResponse,
  QueueStatusResponse,
  TrainSearchResponse,
  SeatMapResponse,
  SelectSeatResponse,
  ConfirmBookingResponse,
  BookingResponse,
  SessionResponse,
  ApiError,
} from '../../shared/types';

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as ApiError;
    throw new Error(err?.error?.message ?? `요청 실패 (${res.status})`);
  }
  return data as T;
}

export const api = {
  login: (body: LoginRequest) =>
    req<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  joinQueue: (trainId: string) =>
    req<JoinQueueResponse>('/queue/join', {
      method: 'POST',
      body: JSON.stringify({ trainId }),
    }),

  queueStatus: (userId: string, trainId: string) =>
    req<QueueStatusResponse>(`/queue/status/${userId}?trainId=${trainId}`),

  leaveQueue: (trainId: string) =>
    req<{ ok: true }>(`/queue/leave?trainId=${trainId}`, { method: 'DELETE' }),

  searchTrains: (from: string, to: string, date: string) =>
    req<TrainSearchResponse>(`/trains?from=${from}&to=${to}&date=${date}`),

  seatMap: (trainId: string) => req<SeatMapResponse>(`/trains/${trainId}/seats`),

  selectSeat: (trainId: string, seatId: string) =>
    req<SelectSeatResponse>('/seat/select', {
      method: 'POST',
      body: JSON.stringify({ trainId, seatId }),
    }),

  confirmBooking: (trainId: string, seatId: string) =>
    req<ConfirmBookingResponse>('/booking/confirm', {
      method: 'POST',
      body: JSON.stringify({ trainId, seatId }),
    }),

  getBooking: (bookingId: string) => req<BookingResponse>(`/booking/${bookingId}`),

  getSession: (userId: string) => req<SessionResponse>(`/session/${userId}`),
};
