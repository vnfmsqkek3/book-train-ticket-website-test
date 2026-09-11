'use client';
/**
 * 결제/예매 확정 화면 (make.md sequenceDiagram Step 5, 6).
 * POST /booking/confirm → Optimistic Lock 검증 → 예매번호 + 티켓 링크 표시.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function PaymentPage() {
  const router = useRouter();
  const [trainId, setTrainId] = useState('');
  const [seatId, setSeatId] = useState('');
  const [bookingNumber, setBookingNumber] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTrainId(localStorage.getItem('trainId') ?? '');
    setSeatId(localStorage.getItem('seatId') ?? '');
  }, []);

  async function confirm() {
    setError('');
    setLoading(true);
    try {
      const r = await api.confirmBooking(trainId, seatId);
      setBookingNumber(r.bookingNumber);
      setBookingId(r.bookingId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    if (!bookingId) return;
    setError('');
    setLoading(true);
    try {
      await api.cancelBooking(bookingId);
      localStorage.removeItem('seatId');
      alert('예약이 취소되었습니다. 좌석이 다시 예매 가능(빈자리) 상태가 됩니다.');
      router.push('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

  return (
    <main>
      <h1>예매 확정</h1>
      {!bookingNumber ? (
        <div className="card">
          <div className="status-bar">
            <span>열차</span>
            <strong>{trainId}</strong>
          </div>
          <div className="status-bar">
            <span>좌석</span>
            <strong>{seatId}</strong>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            확정 시 Optimistic Lock으로 좌석 버전을 검증합니다. 잠금이 만료되면 다시 선택해야 합니다.
          </p>
          <button onClick={confirm} disabled={loading || !seatId}>
            {loading ? '확정 처리 중...' : '결제 및 예매 확정'}
          </button>
          {error && <p style={{ color: 'var(--sold)' }}>{error}</p>}
        </div>
      ) : (
        <div className="card">
          <h2>🎉 예매 완료</h2>
          <div className="status-bar">
            <span>예매번호</span>
            <strong>{bookingNumber}</strong>
          </div>
          <div style={{ marginTop: 16 }} className="row">
            {bookingId && (
              <a href={`${apiBase}/booking/${bookingId}/ticket`} target="_blank" rel="noreferrer">
                <button>티켓 다운로드</button>
              </a>
            )}
            {bookingId && (
              <button onClick={cancel} disabled={loading} style={{ background: 'var(--sold)' }}>
                {loading ? '취소 중...' : '예약 취소'}
              </button>
            )}
            <button onClick={() => router.push('/')} style={{ background: '#475569' }}>
              처음으로
            </button>
          </div>
          {error && <p style={{ color: 'var(--sold)' }}>{error}</p>}
        </div>
      )}
    </main>
  );
}
