import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { z } from 'zod';

const VALID_FLOORS = ['BASEMENT', 'GROUND_FLOOR', 'FIRST_FLOOR', 'SECOND_FLOOR', 'TERRACE', 'ALL_FLOORS'];

const importRowSchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
  floor: z.string().default('ALL_FLOORS'),
  description: z.string().optional(),
});

// POST /api/projects/[projectId]/architecture/rows/import
// Body: { rows: [{ category, name, floor, description }], mode?: 'skip' | 'replace' | 'append' }
//   mode = 'skip'    (default) — skip rows whose name already exists in this project
//   mode = 'append'  — always insert, allowing duplicates
//   mode = 'replace' — not implemented (future)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (!['PMC', 'ARTIFACTS'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const mode: 'skip' | 'append' = body.mode === 'append' ? 'append' : 'skip';

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 });
    }

    // ── Parse & validate incoming rows ───────────────────────────────────────
    const parsed: Array<{ category: string; name: string; floor: string; description?: string }> = [];
    const invalidRows: number[] = [];

    for (let i = 0; i < body.rows.length; i++) {
      try {
        const row = importRowSchema.parse(body.rows[i]);
        const floor = VALID_FLOORS.includes(row.floor.toUpperCase().replace(/\s+/g, '_'))
          ? row.floor.toUpperCase().replace(/\s+/g, '_')
          : 'ALL_FLOORS';
        parsed.push({ ...row, floor });
      } catch {
        invalidRows.push(i + 1);
      }
    }

    if (parsed.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid rows found in the file' }, { status: 400 });
    }

    // ── Duplicate detection (skip mode) ──────────────────────────────────────
    let toInsert = parsed;
    let duplicateCount = 0;

    if (mode === 'skip') {
      // Fetch all existing row names for this project (normalised lowercase)
      const existing = await prisma.drawingRow.findMany({
        where: { projectId },
        select: { name: true, category: true },
      });

      // Build a set of "category::name" keys that already exist
      const existingKeys = new Set(
        existing.map((r) => `${r.category.toLowerCase().trim()}::${r.name.toLowerCase().trim()}`)
      );

      toInsert = parsed.filter((r) => {
        const key = `${r.category.toLowerCase().trim()}::${r.name.toLowerCase().trim()}`;
        return !existingKeys.has(key);
      });
      duplicateCount = parsed.length - toInsert.length;
    }

    if (toInsert.length === 0) {
      // Everything already exists — nothing new to add
      return NextResponse.json({
        success: true,
        data: {
          created: 0,
          skipped: invalidRows.length,
          duplicates: duplicateCount,
          message: `All ${duplicateCount} rows already exist in the project. Nothing was imported.`,
        },
      });
    }

    // ── Insert new rows ───────────────────────────────────────────────────────
    const maxRow = await prisma.drawingRow.findFirst({
      where: { projectId },
      orderBy: { serialNo: 'desc' },
      select: { serialNo: true },
    });
    let nextSerial = (maxRow?.serialNo ?? 0) + 1;

    const created = await prisma.$transaction(
      toInsert.map((r) =>
        prisma.drawingRow.create({
          data: {
            projectId,
            serialNo: nextSerial++,
            category: r.category,
            name: r.name,
            floor: r.floor,
            description: r.description,
            createdById: auth.userId,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      data: {
        created: created.length,
        skipped: invalidRows.length,
        duplicates: duplicateCount,
        skippedRows: invalidRows,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Import error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
