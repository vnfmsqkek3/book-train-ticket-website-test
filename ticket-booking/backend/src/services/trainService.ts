/**
 * trainService — 열차 검색 (make.md sequenceDiagram Step 3)
 * Redis 캐시 TTL 1시간 (캐시 히트/미스).
 */
import { Train, TRAINS_CACHE_TTL_SECONDS } from '../../../shared/types';
import { getRedis } from '../db/redis';
import { findTrains } from '../data/seed';

const redis = getRedis();
const cacheKey = (from: string, to: string, date: string) =>
  `trains:${from}:${to}:${date}`;

export async function searchTrains(
  from = '',
  to = '',
  date = '',
): Promise<{ trains: Train[]; cached: boolean }> {
  const key = cacheKey(from, to, date);
  const hit = await redis.get(key);
  if (hit) return { trains: JSON.parse(hit) as Train[], cached: true };

  const trains = findTrains(from || undefined, to || undefined, date || undefined);
  await redis.set(key, JSON.stringify(trains), TRAINS_CACHE_TTL_SECONDS);
  return { trains, cached: false };
}
