'use client';
/**
 * 홈 화면: 로그인(Step 1) + 열차 검색/선택(Step 3).
 * 로그인 후 열차 선택 → 대기열 화면으로 이동.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import type { Train } from '../../shared/types';

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@ticket.kr');
  const [password, setPassword] = useState('demo1234');
  const [loggedIn, setLoggedIn] = useState(false);
  const [trains, setTrains] = useState<Train[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const { token, userId } = await api.login({ email, password });
      localStorage.setItem('token', token);
      localStorage.setItem('userId', userId);
      setLoggedIn(true);
      const res = await api.searchTrains('서울', '부산', '2026-09-25');
      setTrains(res.trains);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function searchAll() {
    setLoading(true);
    try {
      const res = await api.searchTrains('', '', '');
      setTrains(res.trains);
    } finally {
      setLoading(false);
    }
  }

  function selectTrain(trainId: string) {
    localStorage.setItem('trainId', trainId);
    router.push('/queue');
  }

  return (
    <main>
      <h1>🚄 추석 기차표 예매</h1>
      {!loggedIn ? (
        <div className="card">
          <h2>로그인</h2>
          <div className="row">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={handleLogin} disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--sold)' }}>{error}</p>}
        </div>
      ) : (
        <div className="card">
          <div className="status-bar">
            <h2>열차 선택</h2>
            <button onClick={searchAll} disabled={loading} style={{ flex: '0 0 auto' }}>
              전체 조회
            </button>
          </div>
          {trains.map((t) => (
            <div
              key={t.id}
              className="card"
              style={{ cursor: 'pointer', background: '#0b1220' }}
              onClick={() => selectTrain(t.id)}
            >
              <div className="status-bar">
                <strong>{t.name}</strong>
                <span>{t.departureTime}</span>
              </div>
              <div className="status-bar">
                <span>
                  {t.from} → {t.to}
                </span>
                <span>{t.departureDate}</span>
              </div>
            </div>
          ))}
          {trains.length === 0 && <p>조회된 열차가 없습니다.</p>}
        </div>
      )}
    </main>
  );
}
