/**
 * POST /api/viseron-intelligence/[projectId]/query
 *
 * Executes a natural language query against the Viseron query engine.
 * Body: { query: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { executeQuery } from '@/services/ViseronQueryEngine';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    await requireProjectAuth(params.projectId);

    const body = await request.json();
    const query = body?.query;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query is required' },
        { status: 400 },
      );
    }

    if (query.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Query too long (max 500 characters)' },
        { status: 400 },
      );
    }

    const result = await executeQuery(params.projectId, query);
    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Viseron query error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
