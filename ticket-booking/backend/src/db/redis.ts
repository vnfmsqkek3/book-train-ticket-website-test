/**
 * Redis 추상화 계층.
 *
 * 실제 환경(AWS ElastiCache)에서는 ioredis를 사용하고,
 * REDIS_HOST 미설정 또는 연결 실패 시 in-memory 폴백으로 전환한다.
 * → 로컬/DLT 데모를 외부 의존성 없이 실행 가능하게 한다.
 *
 * 필요한 명령만 노출: INCR, SET(TTL), GET, DEL, EXPIRE, keyspace TTL 만료 감지.
 */
import Redis from 'ioredis';
import { config } from '../config';

export interface RedisLike {
  incr(key: string): Promise<number>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  /** TTL(초). 키 없음 -2, 만료없음 -1 */
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

// ── in-memory 구현 (폴백) ──
class InMemoryRedis implements RedisLike {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private isExpired(k: string): boolean {
    const e = this.store.get(k);
    if (!e) return true;
    if (e.expiresAt !== null && Date.now() >= e.expiresAt) {
      this.store.delete(k);
      return true;
    }
    return false;
  }

  async incr(key: string): Promise<number> {
    if (this.isExpired(key)) this.store.set(key, { value: '0', expiresAt: null });
    const e = this.store.get(key)!;
    const next = Number(e.value) + 1;
    e.value = String(next);
    return next;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async ttl(key: string): Promise<number> {
    const e = this.store.get(key);
    if (!e || this.isExpired(key)) return -2;
    if (e.expiresAt === null) return -1;
    return Math.ceil((e.expiresAt - Date.now()) / 1000);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const out: string[] = [];
    for (const k of this.store.keys()) {
      if (!this.isExpired(k) && regex.test(k)) out.push(k);
    }
    return out;
  }
}

// ── ioredis 어댑터 ──
class IoRedisAdapter implements RedisLike {
  constructor(private client: Redis) {}
  async incr(key: string) {
    return this.client.incr(key);
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
    else await this.client.set(key, value);
  }
  async get(key: string) {
    return this.client.get(key);
  }
  async del(key: string) {
    await this.client.del(key);
  }
  async ttl(key: string) {
    return this.client.ttl(key);
  }
  async keys(pattern: string) {
    return this.client.keys(pattern);
  }
}

let instance: RedisLike | null = null;
let usingFallback = false;

export function getRedis(): RedisLike {
  if (instance) return instance;

  // REDIS_HOST가 명시적으로 설정된 경우에만 실제 연결 시도
  if (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost') {
    try {
      const client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        lazyConnect: false,
        maxRetriesPerRequest: 2,
      });
      client.on('error', (e) => {
        // eslint-disable-next-line no-console
        console.warn('[redis] error, 연결 문제:', e.message);
      });
      instance = new IoRedisAdapter(client);
      return instance;
    } catch {
      usingFallback = true;
    }
  } else {
    usingFallback = true;
  }

  if (usingFallback) {
    // eslint-disable-next-line no-console
    console.warn('[redis] in-memory 폴백 사용 (로컬/데모 모드)');
  }
  instance = new InMemoryRedis();
  return instance;
}

export function isRedisFallback(): boolean {
  return usingFallback;
}
