'use client';
/**
 * 대기열 상태 표시 컴포넌트 (make.md §3 상태 표시)
 * 내 순번, 앞 사람 수, 예상 대기시간을 실시간 표시.
 */
import { QueueState } from '../../../shared/types';

export interface QueueStatusProps {
  queueNumber: number;
  peopleAhead: number;
  estimatedWaitTime: number; // seconds
  state: QueueState;
}

const STATE_LABEL: Record<QueueState, string> = {
  [QueueState.WAITING]: '대기 중',
  [QueueState.READY]: '예매 가능',
  [QueueState.PROCESSING]: '좌석 선택 중',
  [QueueState.COMPLETED]: '예매 완료',
  [QueueState.TIMEOUT]: '시간 초과',
  [QueueState.CANCELLED]: '취소됨',
};

export function QueueStatus({
  queueNumber,
  peopleAhead,
  estimatedWaitTime,
  state,
}: QueueStatusProps) {
  const mins = Math.floor(estimatedWaitTime / 60);
  const secs = estimatedWaitTime % 60;
  return (
    <div className="card">
      <div className="status-bar">
        <strong>내 순번</strong>
        <span
          className={`badge ${state === QueueState.READY ? 'ok' : 'warn'}`}
        >
          {STATE_LABEL[state]}
        </span>
      </div>
      <div style={{ fontSize: '2.5rem', fontWeight: 700, textAlign: 'center', margin: '12px 0' }}>
        {queueNumber}번
      </div>
      <div className="status-bar">
        <span>앞에 {peopleAhead}명 대기</span>
        <span>
          예상 {mins}분 {secs}초
        </span>
      </div>
    </div>
  );
}
