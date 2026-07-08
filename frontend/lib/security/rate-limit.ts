/**
 * In-memory fixed-window rate limiter. Sufficient for a single instance
 * (login throttling, abuse control). A multi-instance deployment needs a
 * shared store (Redis) — swap this module's backing map for that then.
 * Tracked in the Phase 5 hardening notes.
 */

type Window = { count: number; resetAt: number };

const globalForRl = globalThis as unknown as {
  essentiaRateLimit?: Map<string, Window>;
};
const store = (globalForRl.essentiaRateLimit ??= new Map());

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Clears a key on success so a good login doesn't count against the window. */
export function rateLimitReset(key: string): void {
  store.delete(key);
}
