/**
 * Quick benchmark: measures Prisma query latency and API route latency.
 *
 * Usage:
 *   npx tsx scripts/benchmark.ts
 *   npx tsx scripts/benchmark.ts http://localhost:3000   # also test API routes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.argv[2] || '';

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const ms = (performance.now() - start).toFixed(0);
  console.log(`  ${label.padEnd(45)} ${ms}ms`);
  return result;
}

async function benchmarkDb() {
  console.log('\n── Prisma Query Latency ──────────────────────────────');

  // Cold connection
  await time('Cold connect (first query)', () =>
    prisma.$queryRaw`SELECT 1`,
  );

  // Warm queries
  await time('SELECT 1 (warm)', () =>
    prisma.$queryRaw`SELECT 1`,
  );

  await time('User count', () =>
    prisma.user.count(),
  );

  await time('Project list (with roles)', () =>
    prisma.project.findMany({ include: { roles: true } }),
  );

  await time('Milestones (first project)', async () => {
    const p = await prisma.project.findFirst();
    if (!p) return [];
    return prisma.milestone.findMany({
      where: { projectId: p.id },
      include: { paymentEligibility: true, vendorUser: { select: { id: true, name: true } } },
    });
  });

  await time('ProjectRole lookup (unique)', async () => {
    const u = await prisma.user.findFirst();
    const p = await prisma.project.findFirst();
    if (!u || !p) return null;
    return prisma.projectRole.findUnique({
      where: { projectId_userId: { projectId: p.id, userId: u.id } },
    });
  });
}

async function benchmarkApi() {
  if (!BASE_URL) {
    console.log('\n  Skipping API tests (pass URL as argument to enable)');
    return;
  }

  console.log(`\n── API Route Latency (${BASE_URL}) ─────────────────`);

  // Login first to get a session cookie
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', password: 'password123' }),
  });

  const setCookie = loginRes.headers.get('set-cookie');
  if (!setCookie) {
    console.log('  Login failed — cannot test authenticated routes');
    return;
  }

  const cookie = setCookie.split(';')[0];

  const apiGet = (path: string) =>
    fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });

  await time('GET /api/auth/session', () => apiGet('/api/auth/session'));
  await time('GET /api/projects', () => apiGet('/api/projects'));

  // Get first project ID
  const projRes = await apiGet('/api/projects');
  const projData = await projRes.json();
  const projectId = projData?.data?.[0]?.id;

  if (projectId) {
    await time(`GET /api/projects/${projectId.slice(0, 8)}…`, () =>
      apiGet(`/api/projects/${projectId}`),
    );
    await time(`GET /api/projects/${projectId.slice(0, 8)}…/dashboard`, () =>
      apiGet(`/api/projects/${projectId}/dashboard`),
    );
    await time(`GET /api/projects/${projectId.slice(0, 8)}…/milestones`, () =>
      apiGet(`/api/projects/${projectId}/milestones`),
    );
  }
}

async function main() {
  console.log('MilestoneHQ Performance Benchmark');
  console.log('═'.repeat(55));

  await benchmarkDb();
  await benchmarkApi();

  console.log('\n═'.repeat(55));
  console.log('Done.\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
