/**
 * 타입 세이프 API 클라이언트 (shared/types 재사용 — baseline #4)
 */
import type {
  LoginRequest,
  LoginResponse,
  JoinQueueResponse,
  QueueStatusResponse,
  TrainSearchResponse,
  TrainsMetaResponse,
  SeatMapResponse,
  SelectSeatResponse,
  ConfirmBookingResponse,
  BookingResponse,
  SessionResponse,
  ApiError,
} from '../../shared/types';

// ALB 경로 라우팅: 기본은 상대경로 /api (동일 도메인). 로컬 개발 시 env로 override.
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

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

  trainsMeta: () => req<TrainsMetaResponse>('/trains/meta'),

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

  cancelBooking: (bookingId: string) =>
    req<{ ok: true; seatId: string; trainId: string }>(`/booking/${bookingId}`, {
      method: 'DELETE',
    }),

  getSession: (userId: string) => req<SessionResponse>(`/session/${userId}`),

  clearSession: (userId: string) =>
    req<{ ok: true }>(`/session/${userId}`, { method: 'DELETE' }),

  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
};
