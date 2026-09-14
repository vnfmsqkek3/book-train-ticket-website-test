'use client';
/**
 * 홈 화면: 로그인(Step 1) + 열차 검색/선택(Step 3).
 * - 예약 가능 날짜: 시스템 현재 날짜 기준 7일 (백엔드 /trains/meta)
 * - 출발 시간대: 06:00 ~ 23:00 매시간
 * 날짜·노선 선택 → 해당 조건의 시간대별 열차 목록 → 선택 시 대기열로 이동.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import type { Train, TrainRouteMeta } from '../../shared/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function labelForDate(dateStr: string, index: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  const wd = WEEKDAYS[d.getDay()];
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const tag = index === 0 ? '오늘' : index === 1 ? '내일' : `${md}`;
  return `${tag} (${wd})`;
}

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@ticket.kr');
  const [password, setPassword] = useState('demo1234');
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 메타(날짜/노선)
  const [dates, setDates] = useState<string[]>([]);
  const [routes, setRoutes] = useState<TrainRouteMeta[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(0);

  const [trains, setTrains] = useState<Train[]>([]);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const { token, userId } = await api.login({ email, password });
      localStorage.setItem('token', token);
      localStorage.setItem('userId', userId);
      setLoggedIn(true);
      const meta = await api.trainsMeta();
      setDates(meta.dates);
      setRoutes(meta.routes);
      setSelectedDate(meta.dates[0] ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // 날짜/노선 변경 시 열차 목록 갱신
  useEffect(() => {
    if (!loggedIn || !selectedDate || routes.length === 0) return;
    const route = routes[selectedRoute];
    setLoading(true);
    api
      .searchTrains(route.from, route.to, selectedDate)
      .then((r) => setTrains(r.trains.sort((a, b) => a.departureTime.localeCompare(b.departureTime))))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [loggedIn, selectedDate, selectedRoute, routes]);

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
        <>
          {/* 노선 선택 */}
          <div className="card">
            <h2>노선 선택</h2>
            <div className="chip-row">
              {routes.map((r, i) => (
                <button
                  key={`${r.from}-${r.to}`}
                  className={`chip ${i === selectedRoute ? 'chip-active' : ''}`}
                  onClick={() => setSelectedRoute(i)}
                >
                  {r.from} → {r.to}
                </button>
              ))}
            </div>
          </div>

          {/* 날짜 선택 (7일) */}
          <div className="card">
            <h2>날짜 선택 (오늘부터 7일)</h2>
            <div className="chip-row">
              {dates.map((d, i) => (
                <button
                  key={d}
                  className={`chip ${d === selectedDate ? 'chip-active' : ''}`}
                  onClick={() => setSelectedDate(d)}
                >
                  {labelForDate(d, i)}
                </button>
              ))}
            </div>
          </div>

          {/* 시간대별 열차 (06:00 ~ 23:00) */}
          <div className="card">
            <div className="status-bar">
              <h2>출발 시간대</h2>
              <span className="badge ok">{trains.length}편</span>
            </div>
            {loading && <p>불러오는 중...</p>}
            <div className="time-grid">
              {trains.map((t) => (
                <button
                  key={t.id}
                  className="time-slot"
                  onClick={() => selectTrain(t.id)}
                  title={`${t.name} · ${t.from}→${t.to}`}
                >
                  <strong>{t.departureTime}</strong>
                  <span>{t.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
            {!loading && trains.length === 0 && <p>해당 조건의 열차가 없습니다.</p>}
          </div>
          {error && <p style={{ color: 'var(--sold)' }}>{error}</p>}
        </>
      )}
    </main>
  );
}
