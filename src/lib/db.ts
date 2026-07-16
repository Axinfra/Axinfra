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

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  return msg.includes("Can't reach database") || msg.includes('ECONNREFUSED') || msg.toLowerCase().includes('connection');
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    // In dev, only log warn + slow queries via event. Suppress 'error' at the
    // Prisma log level because Neon's PgBouncer pooler emits `kind: Closed`
    // connection events through the error channel — these are informational
    // (Prisma reconnects automatically) and would otherwise flood the console.
    log:
      process.env.NODE_ENV === 'development'
        ? [{ level: 'warn', emit: 'stdout' }, { level: 'query', emit: 'event' }]
        : [],
  });

  // Neon serverless suspends the DB after ~5 min inactivity; the first query after a
  // suspension fails with a connection error even though a retry ~1-2s later succeeds once
  // Neon has resumed. Without this, every request that happens to be first-after-idle would
  // surface a raw 500 instead of just being ~1.5s slower. Only retries on the specific
  // connection-refused signature, not on real query errors (constraint violations etc).
  client.$use(async (params, next) => {
    try {
      return await next(params);
    } catch (err) {
      if (isConnectionError(err)) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return next(params);
      }
      throw err;
    }
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

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
