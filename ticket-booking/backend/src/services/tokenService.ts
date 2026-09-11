/**
 * tokenService — 토큰 정리/무효화 (stateless JWT 보완).
 *
 * 로그아웃 시 사용자별 "무효 기준 시각(invalidBefore)"을 Redis에 기록하고,
 * 인증 시 토큰의 iat(발급시각)이 그 시각보다 이전이면 거부한다.
 * → 이미 발급된 토큰을 서버 측에서 즉시 무효화(정리)할 수 있다.
 */
import { getRedis } from '../db/redis';

const redis = getRedis();
const key = (userId: string) => `token:invalidBefore:${userId}`;
// 토큰 최대 수명(초)보다 길게 보관하면 충분. 기본 24시간.
const TTL_SECONDS = 24 * 3600;

/** 로그아웃: 지금 이전에 발급된 토큰을 모두 무효화 */
export async function invalidateUserTokens(userId: string): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  await redis.set(key(userId), String(nowSec), TTL_SECONDS);
}

/** iat(발급시각, 초)가 무효 기준보다 이전이면 true(=무효) */
export async function isTokenRevoked(userId: string, iat: number | undefined): Promise<boolean> {
  const raw = await redis.get(key(userId));
  if (!raw) return false;
  if (iat === undefined) return true; // iat 없는 토큰은 안전하게 거부
  return iat < Number(raw);
}
