'use client';
/**
 * 좌석 배치도 렌더링 (make.md §3 좌석 상태 인식, UI 렌더링 빨간색)
 * 가용(초록)/임시예약(주황)/판매(빨강). 내가 선택한 좌석은 흰 테두리.
 */
import { Seat, SeatState } from '../../../shared/types';

export interface SeatMapProps {
  seats: Seat[];
  myUserId: string | null;
  mySeatId: string | null;
  onSelect: (seatId: string) => void;
  disabled?: boolean;
}

function seatClass(seat: Seat, myUserId: string | null, mySeatId: string | null): string {
  const base =
    seat.state === SeatState.SOLD
      ? 'sold'
      : seat.state === SeatState.LOCKED
        ? 'locked'
        : 'available';
  const mine = seat.seatId === mySeatId || (seat.ownerId && seat.ownerId === myUserId);
  return `seat ${base}${mine ? ' mine' : ''}`;
}

export function SeatMap({ seats, myUserId, mySeatId, onSelect, disabled }: SeatMapProps) {
  // 행/열 순서로 정렬
  const sorted = [...seats].sort((a, b) =>
    a.position.row === b.position.row
      ? a.position.col.localeCompare(b.position.col)
      : a.position.row - b.position.row,
  );

  return (
    <div className="card">
      <div className="legend">
        <span><i className="dot" style={{ background: 'var(--available)' }} /> 선택 가능</span>
        <span><i className="dot" style={{ background: 'var(--locked)' }} /> 선택 중</span>
        <span><i className="dot" style={{ background: 'var(--sold)' }} /> 예약됨</span>
      </div>
      <div className="seat-grid">
        {sorted.map((seat) => {
          const isMine = seat.seatId === mySeatId || seat.ownerId === myUserId;
          const clickable =
            !disabled &&
            (seat.state === SeatState.AVAILABLE || isMine) &&
            seat.state !== SeatState.SOLD;
          return (
            <button
              key={seat.seatId}
              className={seatClass(seat, myUserId, mySeatId)}
              disabled={!clickable}
              onClick={() => onSelect(seat.seatId)}
              title={`${seat.seatId} (${seat.position.type})`}
            >
              {seat.seatId}
            </button>
          );
        })}
      </div>
    </div>
  );
}
