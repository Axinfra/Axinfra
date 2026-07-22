import { cellStr, findRow, numCell, parseExcelDate, rowText } from './shared';

export interface ParsedDprProcurementRow {
  materialName: string;
  description: string;
  unit: string;
  alreadyReceived: number;
  receivedThisWeek: number;
  cumulativeReceivedTillDate: number;
  consumedTillDate: number;
  balanceAtSite: number;
  additionalRequirement: string;
}

export interface ParsedDprManpowerRow {
  vendorName: string;
  tradeName: string;
  unit: string;
  actualCount: number;
  plannedCount: number;
}

export interface ParsedDprExcel {
  reportDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  procurementRows: ParsedDprProcurementRow[];
  manpowerRows: ParsedDprManpowerRow[];
  highlights: string[];
  criticalIssues: string;
}

const SECTION_MARKERS = ['resources', 'manpower deployed', 'days highlight', 'critical issue', 'photograph'];

function isSectionBoundary(text: string): boolean {
  return SECTION_MARKERS.some((m) => text.includes(m));
}

/** Reads a filled-in DPR Excel (matching the demo sample's layout: header dates, a
 * Procurement table, one or more vendor-grouped Manpower blocks, a Days Highlight list, and
 * a Critical Issues list) and pulls out everything the DPR fill page can use. Section
 * boundaries are detected by label text rather than fixed row numbers, since the vendor
 * count/row count varies per real report. */
export function parseDprExcel(rows: unknown[][]): ParsedDprExcel {
  let reportDate: string | null = null;
  let periodFrom: string | null = null;
  let periodTo: string | null = null;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] ?? [];
    const text = rowText(row);
    if (!reportDate && text.includes('reporting date')) {
      const labelIdx = row.findIndex((c) => cellStr(c).toLowerCase().includes('reporting date'));
      for (let c = labelIdx + 1; c < row.length; c++) {
        const d = parseExcelDate(row[c]);
        if (d) { reportDate = d; break; }
      }
      // Some layouts put the label and its value on separate rows (merged "label above
      // value" cells) rather than side by side — fall back to scanning the row below.
      if (!reportDate) {
        for (const c of rows[i + 1] ?? []) {
          const d = parseExcelDate(c);
          if (d) { reportDate = d; break; }
        }
      }
    }
    if (text.includes('period')) {
      const dates: string[] = [];
      for (const c of row) {
        const d = parseExcelDate(c);
        if (d) dates.push(d);
      }
      if (dates.length === 0) {
        for (const c of rows[i + 1] ?? []) {
          const d = parseExcelDate(c);
          if (d) dates.push(d);
        }
      }
      if (dates.length >= 1) periodFrom = dates[0];
      if (dates.length >= 2) periodTo = dates[1];
    }
  }

  // ── Procurement table ─────────────────────────────────────────────────
  const procurementRows: ParsedDprProcurementRow[] = [];
  const procHeaderIdx = findRow(rows, (t) => t.includes('material') && t.includes('unit') && (t.includes('already') || t.includes('recd')));
  if (procHeaderIdx >= 0) {
    const header = (rows[procHeaderIdx] ?? []).map((c) => cellStr(c).toLowerCase());
    const col = (needle: string) => header.findIndex((h) => h.includes(needle));
    const materialIdx = col('material');
    const descIdx = col('description');
    const unitIdx = col('unit');
    const alreadyIdx = col('already');
    const thisWeekIdx = col('this week');
    const cummIdx = col('cumm');
    const consumedIdx = col('consumed');
    const balanceIdx = col('balance');
    const addlIdx = col('additional');

    for (let i = procHeaderIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const text = rowText(row);
      if (isSectionBoundary(text)) break;
      const materialName = materialIdx >= 0 ? cellStr(row[materialIdx]) : '';
      if (!materialName) continue;
      procurementRows.push({
        materialName,
        description: descIdx >= 0 ? cellStr(row[descIdx]) : '',
        unit: unitIdx >= 0 ? cellStr(row[unitIdx]) : '',
        alreadyReceived: numCell(row[alreadyIdx]),
        receivedThisWeek: numCell(row[thisWeekIdx]),
        cumulativeReceivedTillDate: numCell(row[cummIdx]),
        consumedTillDate: numCell(row[consumedIdx]),
        balanceAtSite: numCell(row[balanceIdx]),
        additionalRequirement: addlIdx >= 0 ? cellStr(row[addlIdx]) : '',
      });
    }
  }

  // ── Manpower — one or more vendor-grouped blocks, each block repeats the pattern:
  // header row ["S.No","Manpower Deployed","Unit", vendor1,"", vendor2,"", ...], an
  // Actual/Planned sub-header row, then trade rows with an (Actual, Planned) column pair
  // per vendor. ─────────────────────────────────────────────────────────
  const manpowerRows: ParsedDprManpowerRow[] = [];
  let searchFrom = 0;
  for (;;) {
    const headerIdx = findRow(rows, (t) => t.includes('manpower deployed'), searchFrom);
    if (headerIdx < 0) break;
    const header = rows[headerIdx] ?? [];
    const vendorCols: { name: string; col: number }[] = [];
    for (let c = 3; c < header.length; c++) {
      const name = cellStr(header[c]);
      if (name) vendorCols.push({ name, col: c });
    }

    let i = headerIdx + 2; // skip header row + Actual/Planned sub-header row
    for (; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const text = rowText(row);
      if (text.includes('manpower deployed') || text.includes('days highlight') || text.includes('critical issue')) break;
      const tradeName = cellStr(row[1]);
      if (!tradeName || tradeName.toLowerCase().includes('total')) continue;
      const unit = cellStr(row[2]);
      for (const vc of vendorCols) {
        const actualCount = numCell(row[vc.col]);
        const plannedCount = numCell(row[vc.col + 1]);
        if (actualCount || plannedCount) {
          manpowerRows.push({ vendorName: vc.name, tradeName, unit, actualCount, plannedCount });
        }
      }
    }
    if (i <= searchFrom) break; // safety against a non-advancing loop
    searchFrom = i;
  }

  // ── Days Highlight ────────────────────────────────────────────────────
  const highlights: string[] = [];
  const highlightsIdx = findRow(rows, (t) => t.includes('days highlight'));
  if (highlightsIdx >= 0) {
    for (let i = highlightsIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (rowText(row).includes('critical issue')) break;
      const desc = cellStr(row[1]) || cellStr(row[0]);
      if (desc) highlights.push(desc);
    }
  }

  // ── Critical Issues ───────────────────────────────────────────────────
  const criticalLines: string[] = [];
  const criticalIdx = findRow(rows, (t) => t.includes('critical issue'));
  if (criticalIdx >= 0) {
    for (let i = criticalIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (rowText(row).includes('photograph')) break;
      const desc = cellStr(row[1]) || cellStr(row[0]);
      if (desc) criticalLines.push(desc);
    }
  }

  return {
    reportDate,
    periodFrom,
    periodTo,
    procurementRows,
    manpowerRows,
    highlights,
    criticalIssues: criticalLines.join('\n'),
  };
}
