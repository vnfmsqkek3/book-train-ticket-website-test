/**
 * 데모용 시드 데이터: 열차 목록 + 좌석 배치.
 * make.md sequenceDiagram Step 3(열차 선택) / Step 4(좌석 선택)용.
 */
import { Seat, Train, SeatState } from '../../../shared/types';

export const TRAINS: Train[] = [
  {
    id: 'KTX-101',
    name: 'KTX 101',
    from: '서울',
    to: '부산',
    departureDate: '2026-09-25',
    departureTime: '09:00',
    totalSeats: 60,
  },
  {
    id: 'KTX-103',
    name: 'KTX 103',
    from: '서울',
    to: '부산',
    departureDate: '2026-09-25',
    departureTime: '11:00',
    totalSeats: 60,
  },
  {
    id: 'SRT-201',
    name: 'SRT 201',
    from: '서울',
    to: '광주',
    departureDate: '2026-09-25',
    departureTime: '10:30',
    totalSeats: 60,
  },
];

const COLS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

function colType(col: string): 'WINDOW' | 'AISLE' | 'MIDDLE' {
  if (col === 'A' || col === 'F') return 'WINDOW';
  if (col === 'C' || col === 'D') return 'AISLE';
  return 'MIDDLE';
}

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
