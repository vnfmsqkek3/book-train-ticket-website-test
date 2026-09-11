/**
 * 좌석 충돌률 0% 정합성 테스트 (make.md baseline #6, DLT 충돌률 0%).
 *
 * k6가 없어도 실행 가능한 Node 스크립트.
 * 다수의 가상 사용자가 "동일 좌석"을 동시에 확정 시도했을 때,
 * 정확히 1명만 성공하는지(이중 판매 0건) 검증한다.
 *
 * 사용:
 *   1) 백엔드 실행: (backend) npm run dev  또는  npm run build && npm start
 *   2) node dlt/concurrency-check.js [BASE_URL] [동시요청수]
 */
const BASE = process.argv[2] || 'http://localhost:4000';
const CONCURRENCY = Number(process.argv[3] || 100);
const TRAIN_ID = 'KTX-101';
const TARGET_SEAT = '5C'; // 모두가 노리는 단일 좌석

async function login(i) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `cc${i}@ticket.kr`, password: 'demo1234' }),
  });
  const { token } = await res.json();
  return token;
}

async function attempt(i) {
  const token = await login(i);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  await fetch(`${BASE}/queue/join`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ trainId: TRAIN_ID }),
  });
  // 스케줄러 승격 대기
  await new Promise((r) => setTimeout(r, 1200));

  const sel = await fetch(`${BASE}/seat/select`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ trainId: TRAIN_ID, seatId: TARGET_SEAT }),
  });
  if (sel.status !== 200) return { locked: false, sold: false };

  const conf = await fetch(`${BASE}/booking/confirm`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ trainId: TRAIN_ID, seatId: TARGET_SEAT }),
  });
  return { locked: true, sold: conf.status === 200 };
}

(async () => {
  console.log(`[DLT] ${CONCURRENCY}명이 좌석 ${TARGET_SEAT} 동시 예매 시도 → ${BASE}`);
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => attempt(i).catch(() => ({ locked: false, sold: false }))),
  );
  const soldCount = results.filter((r) => r.sold).length;
  const lockedCount = results.filter((r) => r.locked).length;

  console.log(`  좌석 잠금 획득: ${lockedCount}명`);
  console.log(`  예매 확정 성공: ${soldCount}명`);
  console.log(`  차단된 충돌: ${CONCURRENCY - lockedCount}건`);

  if (soldCount === 1) {
    console.log('✅ PASS — 충돌률 0%: 정확히 1명만 예매 성공 (baseline #6 충족)');
    process.exit(0);
  } else {
    console.error(`❌ FAIL — ${soldCount}명이 동일 좌석 예매 성공 (이중 판매 발생)`);
    process.exit(1);
  }
})();
