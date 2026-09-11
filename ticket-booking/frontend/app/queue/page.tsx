'use client';
/**
 * 대기순번 화면 (make.md sequenceDiagram Step 2).
 * 대기열 진입 → WebSocket QUEUE_UPDATE 실시간 수신 → READY 시 좌석 화면 이동.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import { QueueStatus } from '../../components/QueueStatus/QueueStatus';
import {
  QueueState,
  ServerEventType,
  ClientEventType,
} from '../../../shared/types';

export default function QueuePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [trainId, setTrainId] = useState<string>('');
  const [info, setInfo] = useState({
    queueNumber: 0,
    peopleAhead: 0,
    estimatedWaitTime: 0,
    state: QueueState.WAITING,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const tr = localStorage.getItem('trainId') ?? '';
    setToken(t);
    setTrainId(tr);
  }, []);

  const { connected, lastEvent, send } = useWebSocket(token);

  // 대기열 진입 (REST + WS 이중 경로)
  useEffect(() => {
    if (!token || !trainId) return;
    api
      .joinQueue(trainId)
      .then((r) =>
        setInfo((prev) => ({
          ...prev,
          queueNumber: r.queueNumber,
          estimatedWaitTime: r.estimatedWaitTime,
          state: r.state,
        })),
      )
      .catch((e) => setError((e as Error).message));
    send({ type: ClientEventType.JOIN_QUEUE, trainId });
  }, [token, trainId, send]);

  // WebSocket 이벤트 반영
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === ServerEventType.QUEUE_UPDATE) {
      setInfo({
        queueNumber: lastEvent.queueNumber,
        peopleAhead: lastEvent.peopleAhead,
        estimatedWaitTime: lastEvent.estimatedWaitTime,
        state: lastEvent.state,
      });
    } else if (lastEvent.type === ServerEventType.ERROR) {
      setError(lastEvent.message);
    }
  }, [lastEvent]);

  // READY 도달 시 좌석 화면 이동
  useEffect(() => {
    if (info.state === QueueState.READY || info.state === QueueState.PROCESSING) {
      router.push('/seats');
    }
  }, [info.state, router]);

  const canProceed = useMemo(
    () => info.state === QueueState.READY || info.state === QueueState.PROCESSING,
    [info.state],
  );

  async function leave() {
    try {
      await api.leaveQueue(trainId);
      router.push('/');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main>
      <h1>대기열</h1>
      <div className="status-bar" style={{ marginBottom: 12 }}>
        <span>열차: {trainId}</span>
        <span className={`badge ${connected ? 'ok' : 'warn'}`}>
          {connected ? '실시간 연결됨' : '재연결 중...'}
        </span>
      </div>
      <QueueStatus {...info} />
      {error && <p style={{ color: 'var(--sold)' }}>{error}</p>}
      <div className="row">
        <button onClick={() => router.push('/seats')} disabled={!canProceed}>
          좌석 선택하기
        </button>
        <button onClick={leave} style={{ background: '#475569' }}>
          대기 취소
        </button>
      </div>
    </main>
  );
}
