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
    // Only log errors — verbose query logging causes major latency on remote DBs
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { level: 'error', emit: 'stdout' },
            { level: 'warn', emit: 'stdout' },
            { level: 'query', emit: 'event' },
          ]
        : ['error'],
  });

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
