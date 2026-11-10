import { NextResponse } from 'next/server';

interface RateBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();
const MAX_BUCKETS = 2000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Sliding-window in-memory rate limiter suitable for low-overhead route protection.
 * Can be reset in tests via `resetRateLimiter()`.
 */
export function checkSlidingWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number = Date.now()
): RateLimitResult {
  if (buckets.size > MAX_BUCKETS) {
    // Evict expired entries first to keep bounded memory
    for (const [bucketKey, bucket] of buckets.entries()) {
      bucket.timestamps = bucket.timestamps.filter((ts) => nowMs - ts < windowMs);
      if (bucket.timestamps.length === 0) {
        buckets.delete(bucketKey);
      }
    }
  }

  const existing = buckets.get(key);
  const active = existing
    ? existing.timestamps.filter((ts) => nowMs - ts < windowMs)
    : [];

  if (active.length >= limit) {
    const oldest = active[0] ?? nowMs;
    const retryAfterMs = Math.max(200, windowMs - (nowMs - oldest));
    buckets.set(key, { timestamps: active });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  active.push(nowMs);
  buckets.set(key, { timestamps: active });

  return {
    allowed: true,
    remaining: Math.max(0, limit - active.length),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimiter(): void {
  buckets.clear();
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim() || 'unknown';
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

export function enforceApiRateLimit(
  req: Request,
  namespace: string,
  actorId: string,
  limit: number = 25,
  windowMs: number = 10_000
): NextResponse | null {
  const ip = getClientIp(req);
  const res = checkSlidingWindowRateLimit(`${namespace}:${actorId}:${ip}`, limit, windowMs);

  if (!res.allowed) {
    return NextResponse.json(
      {
        error: `Thao tác quá nhanh. Vui lòng thử lại sau ${res.retryAfterSeconds} giây.`,
        code: 'RATE_LIMITED',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(res.retryAfterSeconds),
        },
      }
    );
  }

  return null;
}
