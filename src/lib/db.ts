import { PrismaClient } from '@prisma/client';

// ── Runtime validation ──────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  throw new Error(
    'FATAL: DATABASE_URL is not set. ' +
    'Create a .env.local file with your PostgreSQL connection string. ' +
    'See .env.example for the required format.'
  );
}

// ── Singleton ───────────────────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // In dev, only log warn + slow queries via event. Suppress 'error' at the
    // Prisma log level because Neon's PgBouncer pooler emits `kind: Closed`
    // connection events through the error channel — these are informational
    // (Prisma reconnects automatically) and would otherwise flood the console.
    log:
      process.env.NODE_ENV === 'development'
        ? [{ level: 'warn', emit: 'stdout' }, { level: 'query', emit: 'event' }]
        : [],
  });

/**
 * Wraps any Prisma call with one automatic retry on connection errors.
 * Neon serverless suspends the DB after ~5 min inactivity; the first query
 * after a suspension gets a TCP error. Retrying once is sufficient because
 * Neon resumes within ~1-2 seconds of the first connection attempt.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    const isConnErr = msg.includes("Can't reach database") || msg.includes('connection') || msg.includes('ECONNREFUSED');
    if (retries > 0 && isConnErr) {
      await new Promise(r => setTimeout(r, 1500)); // wait for Neon to wake
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

// ── Dev-only: query duration instrumentation ────────────────────────────────
// Logs slow queries (>200ms) to console without the overhead of logging ALL SQL
if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as any).$on('query', (e: { duration: number; query: string }) => {
    if (e.duration > 200) {
      console.warn(`[prisma:slow] ${e.duration}ms — ${e.query.slice(0, 120)}`);
    }
  });
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
