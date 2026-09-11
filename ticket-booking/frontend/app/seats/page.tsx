'use client';
/**
 * 좌석 선택 화면 (make.md sequenceDiagram Step 4).
 * 좌석 클릭 → POST /seat/select(TTL 잠금) → WebSocket SEAT_STATUS diff로 실시간 갱신.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import { SeatMap } from '../../components/SeatMap/SeatMap';
import { Seat, SeatState, ServerEventType } from '../../../shared/types';

export default function SeatsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [trainId, setTrainId] = useState('');
  const [seats, setSeats] = useState<Seat[]>([]);
  const [mySeatId, setMySeatId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [lockExpiresAt, setLockExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('token'));
    setUserId(localStorage.getItem('userId'));
    setTrainId(localStorage.getItem('trainId') ?? '');
  }, []);

  const { lastEvent } = useWebSocket(token);

  useEffect(() => {
    if (!token || !trainId) return;
    api
      .seatMap(trainId)
      .then((r) => setSeats(r.seats))
      .catch((e) => setError((e as Error).message));
  }, [token, trainId]);

  // 실시간 좌석 diff 반영 (baseline #7)
  useEffect(() => {
    if (lastEvent?.type === ServerEventType.SEAT_STATUS) {
      setSeats((prev) =>
        prev.map((s) => {
          const change = lastEvent.changes.find((c) => c.seatId === s.seatId);
          return change ? { ...s, state: change.state, ownerId: change.ownerId } : s;
        }),
      );
    }
  }, [lastEvent]);

  async function handleSelect(seatId: string) {
    setError('');
    try {
      const r = await api.selectSeat(trainId, seatId);
      setMySeatId(seatId);
      setLockExpiresAt(r.lockExpiresAt);
      localStorage.setItem('seatId', seatId);
      // 낙관적 UI 반영
      setSeats((prev) =>
        prev.map((s) =>
          s.seatId === seatId
            ? { ...s, state: SeatState.LOCKED, ownerId: userId }
            : s,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main>
      <h1>좌석 선택</h1>
      <div className="status-bar" style={{ marginBottom: 12 }}>
        <span>열차: {trainId}</span>
        {lockExpiresAt && (
          <span className="badge warn">
            잠금 만료: {new Date(lockExpiresAt).toLocaleTimeString('ko-KR')}
          </span>
        )}
      </div>
      <SeatMap
        seats={seats}
        myUserId={userId}
        mySeatId={mySeatId}
        onSelect={handleSelect}
      />
      {error && <p style={{ color: 'var(--sold)' }}>{error}</p>}
      <div className="row">
        <button onClick={() => router.push('/payment')} disabled={!mySeatId}>
          예매 확정하기
        </button>
        <button onClick={() => router.push('/queue')} style={{ background: '#475569' }}>
          이전
        </button>
      </div>
    </main>
  );
}
