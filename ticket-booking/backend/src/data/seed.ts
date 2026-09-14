/**
 * 데모용 시드 데이터: 열차 목록 + 좌석 배치.
 *
 * 열차는 "시스템 현재 날짜 기준 7일" × "06:00~23:00 매시간(18개 시간대)" × "노선별"로
 * 동적으로 생성된다. 서버 기동 시점의 날짜를 기준으로 삼는다.
 *
 * 열차 ID 규칙: {ROUTE}-{YYYYMMDD}-{HH}   예) KTX-SEO-BSN-20260914-06
 */
import { Seat, Train, SeatState } from '../../../shared/types';

// 운행 노선 정의
interface RouteDef {
  code: string; // ID용 접두
  name: string; // 표시명 접두 (열차 종류)
  from: string;
  to: string;
}

const ROUTES: RouteDef[] = [
  { code: 'KTX-SEO-BSN', name: 'KTX', from: '서울', to: '부산' },
  { code: 'SRT-SEO-GWJ', name: 'SRT', from: '서울', to: '광주' },
];

// 운행 시간대: 06:00 ~ 23:00 매시간 (18개)
export const DEPARTURE_HOURS: number[] = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23

// 예약 가능 일수 (시스템 날짜 기준 7일)
export const BOOKABLE_DAYS = 7;

const COLS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

function colType(col: string): 'WINDOW' | 'AISLE' | 'MIDDLE' {
  if (col === 'A' || col === 'F') return 'WINDOW';
  if (col === 'C' || col === 'D') return 'AISLE';
  return 'MIDDLE';
}

/** 로컬 기준 YYYY-MM-DD */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 시스템 현재 날짜 기준 예약 가능한 7일 (YYYY-MM-DD 배열) */
export function bookableDates(base: Date = new Date()): string[] {
  const dates: string[] = [];
  for (let i = 0; i < BOOKABLE_DAYS; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(toDateStr(d));
  }
  return dates;
}

function trainId(routeCode: string, dateStr: string, hour: number): string {
  return `${routeCode}-${dateStr.replace(/-/g, '')}-${String(hour).padStart(2, '0')}`;
}

/** 전체 열차 목록 동적 생성 (7일 × 18시간대 × 노선) */
export function generateTrains(base: Date = new Date()): Train[] {
  const trains: Train[] = [];
  for (const date of bookableDates(base)) {
    for (const route of ROUTES) {
      for (const hour of DEPARTURE_HOURS) {
        const hh = String(hour).padStart(2, '0');
        trains.push({
          id: trainId(route.code, date, hour),
          name: `${route.name} ${hh}:00`,
          from: route.from,
          to: route.to,
          departureDate: date,
          departureTime: `${hh}:00`,
          totalSeats: 60,
        });
      }
    }
  }
  return trains;
}

// 서버 기동 시점 기준으로 한 번 생성해 캐시 (동일 실행 내 일관성 보장)
export const BOOT_BASE = new Date();
export const TRAINS: Train[] = generateTrains(BOOT_BASE);

/** 열차 하나당 10행 x 6열 = 60석 생성 */
export function generateSeats(trainId: string): Seat[] {
  const seats: Seat[] = [];
  for (let row = 1; row <= 10; row++) {
    for (const col of COLS) {
      seats.push({
        seatId: `${row}${col}`,
        trainId,
        state: SeatState.AVAILABLE,
        ownerId: null,
        version: 0,
        lockExpiresAt: null,
        position: { row, col, type: colType(col) },
      });
    }
  }
  return seats;
}

export function allSeeds(): Seat[] {
  return TRAINS.flatMap((t) => generateSeats(t.id));
}

export function findTrains(from?: string, to?: string, date?: string): Train[] {
  return TRAINS.filter(
    (t) =>
      (!from || t.from === from) &&
      (!to || t.to === to) &&
      (!date || t.departureDate === date),
  );
}

/** 노선 목록 (from/to) — 프론트 드롭다운용 */
export function routeList(): Array<{ from: string; to: string }> {
  return ROUTES.map((r) => ({ from: r.from, to: r.to }));
}
