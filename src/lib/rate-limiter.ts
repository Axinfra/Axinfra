/**
 * rate-limiter.ts
 *
 * Primary store: Upstash Redis (shared across all serverless instances — an in-memory-only
 * limiter is trivially bypassed on a multi-instance/serverless deployment since each instance
 * would keep its own separate counter).
 * Fallback store: in-process Map — used when Upstash env vars are absent (local dev). Not
 * distributed; resets on server restart. Matches the fallback pattern in lib/cache.ts.
 */

import { getRedis } from './cache';

interface RateLimitEntry {
    count: number;
    resetAt: number; // epoch ms
}

export class RateLimiter {
    private name: string;
    private store = new Map<string, RateLimitEntry>();
    private maxAttempts: number;
    private windowMs: number;

    constructor(name: string, maxAttempts: number, windowMs: number) {
        this.name = name;
        this.maxAttempts = maxAttempts;
        this.windowMs = windowMs;
    }

    /**
     * Check if a key is rate limited, incrementing its counter as a side effect.
     * Returns { allowed: true } if under limit, or { allowed: false, retryAfterMs } if over.
     */
    async check(key: string): Promise<{ allowed: boolean; retryAfterMs?: number }> {
        const redis = getRedis();
        if (redis) {
            try {
                const redisKey = `ratelimit:${this.name}:${key}`;
                const count = await redis.incr(redisKey);
                if (count === 1) {
                    await redis.pexpire(redisKey, this.windowMs);
                }
                if (count > this.maxAttempts) {
                    const ttl = await redis.pttl(redisKey);
                    return { allowed: false, retryAfterMs: ttl > 0 ? ttl : this.windowMs };
                }
                return { allowed: true };
            } catch (err) {
                console.error(`[rate-limiter] Redis check failed for ${key}, falling back to in-memory:`, err);
                // fall through to in-memory below
            }
        }

        const now = Date.now();
        const entry = this.store.get(key);

        // No entry or window expired → reset
        if (!entry || now >= entry.resetAt) {
            this.store.set(key, { count: 1, resetAt: now + this.windowMs });
            return { allowed: true };
        }

        // Under limit
        if (entry.count < this.maxAttempts) {
            entry.count++;
            return { allowed: true };
        }

        // Over limit
        return {
            allowed: false,
            retryAfterMs: entry.resetAt - now,
        };
    }

    /**
     * Reset the counter for a key (e.g., after successful login).
     */
    async reset(key: string): Promise<void> {
        const redis = getRedis();
        if (redis) {
            try {
                await redis.del(`ratelimit:${this.name}:${key}`);
            } catch (err) {
                console.error(`[rate-limiter] Redis reset failed for ${key}:`, err);
            }
        }
        this.store.delete(key);
    }

    /**
     * Periodic cleanup of expired in-memory entries to prevent unbounded growth on
     * long-running processes without Redis configured. Redis entries expire on their own
     * via PEXPIRE and never need this.
     */
    cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];
        this.store.forEach((entry, key) => {
            if (now >= entry.resetAt) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.store.delete(key));
    }
}

/**
 * Pre-configured login rate limiter:
 *   5 attempts per 10 minutes per IP+email
 */
export const loginRateLimiter = new RateLimiter(
    'login',
    5,                   // max attempts
    10 * 60 * 1000       // 10 minute window
);

/**
 * Pre-configured registration rate limiter:
 *   5 accounts per 15 minutes per IP+email — registration is more expensive to abuse than a
 *   login attempt (bcrypt hash at cost 12 + a welcome email send per request), so this exists
 *   even though registration has no prior failed-attempt concept to protect against.
 */
export const registerRateLimiter = new RateLimiter(
    'register',
    5,
    15 * 60 * 1000
);

/**
 * Pre-configured public-form rate limiter (contact / demo-request):
 *   5 submissions per 10 minutes per IP — these routes are unauthenticated by design and each
 *   submission triggers an outbound email, so an unbounded endpoint is an easy spam/cost vector.
 */
export const publicFormRateLimiter = new RateLimiter(
    'public-form',
    5,
    10 * 60 * 1000
);

/**
 * Pre-configured forgot-password rate limiter:
 *   5 requests per 30 minutes per IP+email — each request triggers a bcrypt hash (cost 12) and
 *   an outbound email, and unlike login this has no "wrong password" signal to slow an attacker
 *   down on its own, so it needs its own limiter rather than reusing loginRateLimiter.
 */
export const forgotPasswordRateLimiter = new RateLimiter(
    'forgot-password',
    5,
    30 * 60 * 1000
);

/**
 * Pre-configured AI-generation rate limiter (Work Order AI draft, and any future AI-drafting
 * endpoint):
 *   20 requests per hour per user — every request is a real, billed Claude API call shared
 *   across every client/tenant on the same Anthropic account (Claude's own rate limits are
 *   org-wide, not per-tenant), so an unbounded endpoint lets one client's misclick loop or buggy
 *   retry degrade or exhaust the shared quota for everyone else. 20/hr comfortably covers normal
 *   PMC usage (a handful of work orders per day) while capping the blast radius of abuse.
 */
export const aiGenerationRateLimiter = new RateLimiter(
    'ai-generate',
    20,
    60 * 60 * 1000
);
