/**
 * rate-limiter.ts — Simple in-memory rate limiter for MVP.
 *
 * Tracks attempts by a composite key (e.g., IP+email) and enforces
 * a maximum number of attempts within a time window.
 *
 * NOTE: In-memory = resets on server restart; not shared across instances.
 * For production multi-instance: replace with Redis-backed implementation.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number; // epoch ms
}

export class RateLimiter {
    private store = new Map<string, RateLimitEntry>();
    private maxAttempts: number;
    private windowMs: number;

    constructor(maxAttempts: number, windowMs: number) {
        this.maxAttempts = maxAttempts;
        this.windowMs = windowMs;
    }

    /**
     * Check if a key is rate limited.
     * Returns { allowed: true } if under limit, or { allowed: false, retryAfterMs } if over.
     */
    check(key: string): { allowed: boolean; retryAfterMs?: number } {
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
    reset(key: string): void {
        this.store.delete(key);
    }

    /**
     * Periodic cleanup of expired entries to prevent memory leak.
     * Call this on a timer or at some cadence.
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
    5,                   // max attempts
    10 * 60 * 1000       // 10 minute window
);
