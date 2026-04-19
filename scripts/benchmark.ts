/**
 * Axinfra Performance Benchmark
 *
 * Usage:
 *   npx tsx scripts/benchmark.ts
 *   npx tsx scripts/benchmark.ts http://localhost:3000
 *
 * Features:
 *   - Repeat runs → p50 / p95 / p99 / avg per operation
 *   - Cold vs warm distinction (DB + API)
 *   - Concurrency tiers [1, 5, 10, 25] on key API routes
 *   - User-flow simulation (login → projects → dashboard)
 *   - Evidence upload benchmark (1 MB / 5 MB synthetic files)
 *   - Structured console.table summary at the end
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.argv[2] || '';

// ─── Stats helpers ────────────────────────────────────────────────────────────

interface Stats {
  label: string;
  runs: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

function calcStats(label: string, samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);

  const pct = (p: number) => sorted[Math.min(Math.floor((p / 100) * n), n - 1)];

  return {
    label,
    runs: n,
    avg: Math.round(sum / n),
    p50: Math.round(pct(50)),
    p95: Math.round(pct(95)),
    p99: Math.round(pct(99)),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[n - 1]),
  };
}

function printStats(stats: Stats) {
  const bar = (ms: number) => '█'.repeat(Math.min(Math.round(ms / 100), 40));
  console.log(
    `  ${stats.label.padEnd(48)}` +
      `avg=${String(stats.avg).padStart(5)}ms  ` +
      `p50=${String(stats.p50).padStart(5)}ms  ` +
      `p95=${String(stats.p95).padStart(5)}ms  ` +
      `p99=${String(stats.p99).padStart(5)}ms  ` +
      `[${stats.min}–${stats.max}ms]`,
  );
}

// ─── Core timing primitives ───────────────────────────────────────────────────

/**
 * Run fn once and return elapsed ms. Used for cold-start measurements.
 */
async function timeOnce<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  console.log(`  ${label.padEnd(48)} ${Math.round(ms)}ms  (single shot)`);
  return { result, ms };
}

/**
 * Run fn `runs` times sequentially, print percentile stats, return last result.
 */
async function timeMany<T>(
  label: string,
  fn: () => Promise<T>,
  runs = 10,
): Promise<{ result: T; stats: Stats }> {
  const samples: number[] = [];
  let result!: T;

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    result = await fn();
    samples.push(performance.now() - start);
  }

  const stats = calcStats(label, samples);
  printStats(stats);
  return { result, stats };
}

/**
 * Fire `concurrency` parallel copies of fn, measure wall-clock time for the
 * whole batch, and return per-request samples.
 */
async function timeConcurrent(
  label: string,
  fn: () => Promise<unknown>,
  concurrency: number,
): Promise<Stats> {
  const starts = Array.from({ length: concurrency }, () => {
    const t = performance.now();
    return fn().then(() => performance.now() - t);
  });

  const samples = await Promise.all(starts);
  const stats = calcStats(`${label} [c=${concurrency}]`, samples);
  printStats(stats);
  return stats;
}

// ─── DB benchmark ─────────────────────────────────────────────────────────────

const dbSummary: Stats[] = [];

async function benchmarkDb() {
  console.log('\n── Prisma Query Latency ──────────────────────────────────────────────');

  // --- Cold start (single shot, intentionally not repeated) ---
  console.log('\n  [cold]');
  const { ms: coldMs } = await timeOnce('Cold connect  SELECT 1', () => prisma.$queryRaw`SELECT 1`);
  dbSummary.push(calcStats('DB cold connect', [coldMs]));

  // --- Warm repeated queries ---
  console.log('\n  [warm — 10 runs each]');

  const { stats: s1 } = await timeMany('SELECT 1 (warm)', () => prisma.$queryRaw`SELECT 1`);
  dbSummary.push(s1);

  const { stats: s2 } = await timeMany('user.count()', () => prisma.user.count());
  dbSummary.push(s2);

  const { stats: s3 } = await timeMany('project.findMany({ include: roles })', () =>
    prisma.project.findMany({ include: { roles: true } }),
  );
  dbSummary.push(s3);

  // Resolve fixture IDs once (outside timed loop)
  const firstProject = await prisma.project.findFirst();
  const firstUser = await prisma.user.findFirst();

  if (firstProject) {
    const { stats: s4 } = await timeMany('milestone.findMany (first project, full include)', () =>
      prisma.milestone.findMany({
        where: { projectId: firstProject.id },
        include: {
          paymentEligibility: true,
          vendorUser: { select: { id: true, name: true } },
        },
      }),
    );
    dbSummary.push(s4);
  }

  if (firstProject && firstUser) {
    const { stats: s5 } = await timeMany('projectRole.findUnique (by composite key)', () =>
      prisma.projectRole.findUnique({
        where: { projectId_userId: { projectId: firstProject.id, userId: firstUser.id } },
      }),
    );
    dbSummary.push(s5);
  }
}

// ─── API benchmark ────────────────────────────────────────────────────────────

const apiSummary: Stats[] = [];

async function login(): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', password: 'password123' }),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? null;
  if (!cookie) console.log('  ⚠  Login failed — authenticated routes will be skipped');
  return cookie;
}

function makeGet(cookie: string) {
  return (path: string) => fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
}

async function benchmarkApi() {
  if (!BASE_URL) {
    console.log('\n  Skipping API tests — pass a base URL as the first argument to enable.');
    return;
  }

  console.log(`\n── API Route Latency  ${BASE_URL} ────────────────────────────────────`);

  // --- Cold (first hit after process start) ---
  console.log('\n  [cold — single shot per route]');

  const coldCookie = await login();
  if (!coldCookie) return;
  const coldGet = makeGet(coldCookie);

  const { ms: coldSession } = await timeOnce('GET /api/auth/session', () =>
    coldGet('/api/auth/session'),
  );
  apiSummary.push(calcStats('API cold /auth/session', [coldSession]));

  const { ms: coldProjects } = await timeOnce('GET /api/projects', () =>
    coldGet('/api/projects'),
  );
  apiSummary.push(calcStats('API cold /projects', [coldProjects]));

  // Resolve project ID for further tests
  const projData = await coldGet('/api/projects').then((r) => r.json());
  const projectId: string | undefined = projData?.data?.[0]?.id;

  if (projectId) {
    const short = projectId.slice(0, 8) + '…';

    const { ms: coldDash } = await timeOnce(`GET /api/projects/${short}/dashboard`, () =>
      coldGet(`/api/projects/${projectId}/dashboard`),
    );
    apiSummary.push(calcStats(`API cold /dashboard`, [coldDash]));
  }

  // --- Warm repeated runs ---
  console.log('\n  [warm — 10 runs each]');

  const warmCookie = await login();
  if (!warmCookie) return;
  const warmGet = makeGet(warmCookie);

  const { stats: ws1 } = await timeMany('GET /api/auth/session', () =>
    warmGet('/api/auth/session'),
  );
  apiSummary.push(ws1);

  const { stats: ws2 } = await timeMany('GET /api/projects', () => warmGet('/api/projects'));
  apiSummary.push(ws2);

  if (projectId) {
    const short = projectId.slice(0, 8) + '…';

    const { stats: ws3 } = await timeMany(`GET /api/projects/${short}`, () =>
      warmGet(`/api/projects/${projectId}`),
    );
    apiSummary.push(ws3);

    const { stats: ws4 } = await timeMany(`GET /api/projects/${short}/dashboard`, () =>
      warmGet(`/api/projects/${projectId}/dashboard`),
    );
    apiSummary.push(ws4);

    const { stats: ws5 } = await timeMany(`GET /api/projects/${short}/milestones`, () =>
      warmGet(`/api/projects/${projectId}/milestones`),
    );
    apiSummary.push(ws5);
  }

  // --- Concurrency tiers on the two slowest-looking routes ---
  if (projectId) {
    console.log('\n  [concurrency tiers — /dashboard]');
    const short = projectId.slice(0, 8) + '…';

    for (const c of [1, 5, 10, 25]) {
      const s = await timeConcurrent(
        `GET /api/projects/${short}/dashboard`,
        () => fetch(`${BASE_URL}/api/projects/${projectId}/dashboard`, { headers: { Cookie: warmCookie } }),
        c,
      );
      apiSummary.push(s);
    }

    console.log('\n  [concurrency tiers — /milestones]');
    for (const c of [1, 5, 10, 25]) {
      const s = await timeConcurrent(
        `GET /api/projects/${short}/milestones`,
        () => fetch(`${BASE_URL}/api/projects/${projectId}/milestones`, { headers: { Cookie: warmCookie } }),
        c,
      );
      apiSummary.push(s);
    }
  }

  // --- User flow: login → projects → dashboard (end-to-end) ---
  console.log('\n  [user flow — 5 runs]');

  const { stats: flowStats } = await timeMany(
    'Full flow: login → projects → dashboard',
    async () => {
      const c = await login();
      if (!c) return;
      const g = makeGet(c);
      await g('/api/projects');
      if (projectId) await g(`/api/projects/${projectId}/dashboard`);
    },
    5,
  );
  apiSummary.push(flowStats);

  // --- Evidence upload benchmark ---
  console.log('\n  [evidence upload — synthetic payloads]');

  if (projectId) {
    for (const sizeMb of [1, 5, 10]) {
      const blob = new Blob([new Uint8Array(sizeMb * 1024 * 1024)], { type: 'application/octet-stream' });
      const form = new FormData();
      form.append('file', blob, `synthetic_${sizeMb}mb.bin`);
      form.append('projectId', projectId);

      const { stats: upStats } = await timeMany(
        `POST /api/evidence  (${sizeMb} MB)`,
        () =>
          fetch(`${BASE_URL}/api/evidence`, {
            method: 'POST',
            headers: { Cookie: warmCookie! },
            body: form,
          }),
        3,
      );
      apiSummary.push(upStats);
    }
  }
}

// ─── Summary table ────────────────────────────────────────────────────────────

function printSummary() {
  console.log('\n\n═'.repeat(55));
  console.log('SUMMARY');
  console.log('═'.repeat(55));

  // Highlight anything with p95 > 1000ms
  const flagged = [...dbSummary, ...apiSummary].filter((s) => s.p95 > 1000);

  console.log('\nDB stats:');
  console.table(
    dbSummary.map(({ label, runs, avg, p50, p95, p99, min, max }) => ({
      label,
      runs,
      'avg ms': avg,
      'p50 ms': p50,
      'p95 ms': p95,
      'p99 ms': p99,
      'min ms': min,
      'max ms': max,
    })),
  );

  if (BASE_URL) {
    console.log('\nAPI stats:');
    console.table(
      apiSummary.map(({ label, runs, avg, p50, p95, p99, min, max }) => ({
        label,
        runs,
        'avg ms': avg,
        'p50 ms': p50,
        'p95 ms': p95,
        'p99 ms': p99,
        'min ms': min,
        'max ms': max,
      })),
    );
  }

  if (flagged.length > 0) {
    console.log('\n⚠  SLOW (p95 > 1000ms):');
    for (const s of flagged) {
      console.log(`   • ${s.label}  →  p95=${s.p95}ms  p99=${s.p99}ms`);
    }
  } else {
    console.log('\n✅  All operations under 1000ms at p95.');
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log('Axinfra Performance Benchmark');
  console.log('═'.repeat(55));
  console.log(`  Started   : ${new Date().toISOString()}`);
  console.log(`  Base URL  : ${BASE_URL || '(DB only)'}`);

  await benchmarkDb();
  await benchmarkApi();

  printSummary();

  console.log('\nDone.\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});