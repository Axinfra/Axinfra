import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, ts: Date.now() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const err = error as Error;
    console.error('[keepalive] DB ping failed:', err?.message);
    return NextResponse.json(
      { ok: false, error: 'db_unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
