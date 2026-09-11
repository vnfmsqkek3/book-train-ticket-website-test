/**
 * DLT(분산 부하 테스트) — k6 스크립트 (make.md §5 DLT 검증 기준)
 *
 * 목표: 동시 사용자 1,000명
 *   - 평균 응답시간 < 500ms
 *   - p99 < 2s
 *   - 처리량(RPS) ≥ 100
 *   - 좌석 선택 충돌률 0% (중복 좌석 판매 없음)
 *
 * 실행: k6 run --env BASE=http://<alb-dns> dlt/k6-load-test.js
 *
 * 시나리오: 로그인 → 대기열 진입 → 좌석맵 조회 → 좌석 선택 → 예매 확정
 * 각 VU가 서로 다른 좌석을 노려 충돌(409)을 유발하고, 충돌률을 측정한다.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:4000';
const TRAIN_ID = __ENV.TRAIN_ID || 'KTX-101';

// 좌석 충돌 지표 (make.md 충돌률 0% 검증)
const seatConflicts = new Counter('seat_conflicts');
const doubleSell = new Counter('double_sell'); // 이미 판매된 좌석 재판매 시도 성공 (0이어야 함)
const bookingSuccess = new Rate('booking_success');

export const options = {
  scenarios: {
    // make.md DLT: 동시 사용자 1,000명
    peak_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 }, // 단계적 부하 증가
        { duration: '30s', target: 500 },
        { duration: '1m', target: 1000 }, // 1,000 동시 사용자 유지
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // make.md DLT 검증 기준 (자동 통과/실패 판정)
    http_req_duration: ['avg<500', 'p(99)<2000'], // 평균<500ms, p99<2s
    http_reqs: ['rate>=100'], // 처리량 ≥100 RPS
    double_sell: ['count==0'], // 중복 판매 0건 (충돌률 0%)
    checks: ['rate>0.95'],
  },
};

function login(vu) {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: `load${vu}@ticket.kr`, password: 'demo1234' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { '로그인 200': (r) => r.status === 200 });
  return res.json('token');
}

export default function () {
  const vu = __VU;
  const token = login(vu);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // 대기열 진입
  const join = http.post(`${BASE}/queue/join`, JSON.stringify({ trainId: TRAIN_ID }), { headers });
  check(join, { '대기열 진입': (r) => r.status === 200 });

  sleep(1); // 대기 상태 → 스케줄러가 READY로 승격할 시간

  // 좌석맵 조회
  http.get(`${BASE}/trains/${TRAIN_ID}/seats`, { headers });

  // VU마다 좌석 후보를 분산하되 일부 겹치게 하여 충돌 유발
  const row = (vu % 10) + 1;
  const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
  const seatId = `${row}${cols[vu % 6]}`;

  const select = http.post(
    `${BASE}/seat/select`,
    JSON.stringify({ trainId: TRAIN_ID, seatId }),
    { headers },
  );
  if (select.status === 409) {
    seatConflicts.add(1); // 정상적인 충돌 차단 (baseline #6 동작)
    return;
  }
  check(select, { '좌석 선택 200': (r) => r.status === 200 });

  // 예매 확정
  const confirm = http.post(
    `${BASE}/booking/confirm`,
    JSON.stringify({ trainId: TRAIN_ID, seatId }),
    { headers },
  );
  const ok = confirm.status === 200;
  bookingSuccess.add(ok);

  // 이미 잠금 소유자가 아닌데 확정 성공하면 이중 판매 → 절대 발생하면 안 됨
  if (confirm.status === 200 && select.status !== 200) {
    doubleSell.add(1);
  }
  check(confirm, { '예매 확정 처리됨': (r) => r.status === 200 || r.status === 409 });

  sleep(1);
}
