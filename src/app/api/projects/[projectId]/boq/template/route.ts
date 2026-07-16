import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';

// GET /api/projects/[projectId]/boq/template
// Returns a pre-filled .xlsx template with project purchase order names + sample rows.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const orders = await prisma.phase.findMany({
      // Execution/WBS phases aren't Purchase Orders — excludes schedule-imported phases too,
      // since a promoted top-level WBS phase would otherwise satisfy parentPhaseId: null.
      where: { projectId, parentPhaseId: null, scheduleImportId: null },
      orderBy: { sortOrder: 'asc' },
      select: { name: true },
    });

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: BOQ Import ──────────────────────────────────────────────────
    const headers = ['Purchase Order', 'Description', 'Unit', 'Quantity', 'Rate (₹)'];

    const p0 = orders[0]?.name ?? 'Purchase Order 0 - Foundation';
    const p1 = orders[1]?.name ?? 'Purchase Order 1 - Structure';
    const p2 = orders[2]?.name ?? 'Purchase Order 2 - Finishing';

    const sampleRows: (string | number)[][] = [
      [p0, 'Excavation for isolated columns', 'cum', 50, 850],
      [p0, 'PCC M10 (1:3:6) below footing', 'cum', 12, 4200],
      [p0, 'Anti-termite treatment to sub-soil', 'sqm', 180, 65],
      [p1, 'RCC M25 for isolated footings', 'cum', 18, 8500],
      [p1, 'Steel reinforcement Fe500D', 'kg', 2400, 72],
      [p1, 'Brick masonry 230mm (1:6)', 'sqm', 320, 580],
      [p1, 'Formwork to columns & beams', 'sqm', 480, 320],
      [p2, 'Internal plaster 12mm (1:4)', 'sqm', 850, 145],
      [p2, 'External cement paint (2 coats)', 'sqm', 420, 88],
      [p2, 'Vitrified tiles 600×600 (AAA)', 'sqm', 210, 680],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = [
      { wch: 30 }, // Purchase Order
      { wch: 45 }, // Description
      { wch: 10 }, // Unit
      { wch: 12 }, // Quantity
      { wch: 14 }, // Rate
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'BOQ Import');

    // ── Sheet 2: Purchase Order Reference ──────────────────────────────────────
    const refRows: string[][] = [
      ['Available Purchase Orders — copy exact name into the Purchase Order column above'],
      [''],
      ...orders.map((o) => [o.name]),
    ];
    if (orders.length === 0) {
      refRows.push(['No purchase orders created yet — add purchase orders first, then re-download this template']);
    }
    const refWs = XLSX.utils.aoa_to_sheet(refRows);
    refWs['!cols'] = [{ wch: 55 }];
    XLSX.utils.book_append_sheet(wb, refWs, 'Purchase Order Reference');

    // ── Sheet 3: Instructions ────────────────────────────────────────────────
    const instrRows: string[][] = [
      ['HOW TO USE THIS TEMPLATE'],
      [''],
      ['1. Fill in the "BOQ Import" sheet — one row per BOQ line item'],
      ['2. Purchase Order: must match exactly one of the names in the "Purchase Order Reference" sheet'],
      ['3. Description: describe the work item clearly'],
      ['4. Unit: e.g. sqm, cum, rmt, kg, nos, ls'],
      ['5. Quantity: numeric value (must be > 0)'],
      ['6. Rate (₹): unit rate in Indian Rupees (must be > 0)'],
      ['7. Value column is auto-calculated — do not add it'],
      ['8. Delete these sample rows before uploading your real data'],
      ['9. Items with blank or invalid rows are automatically skipped'],
      ['10. You can create BOQs for multiple purchase orders in one upload'],
    ];
    const instrWs = XLSX.utils.aoa_to_sheet(instrRows);
    instrWs['!cols'] = [{ wch: 65 }];
    XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as BodyInit;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="boq-import-template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('BOQ template error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
