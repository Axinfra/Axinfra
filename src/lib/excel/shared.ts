// Small helpers shared by the Checklist/DPR Excel parsers — both work off the raw
// array-of-arrays shape returned by `XLSX.utils.sheet_to_json(ws, { header: 1 })`.

export function cellStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function rowText(row: unknown[] | undefined): string {
  return (row ?? []).map(cellStr).join(' ').toLowerCase();
}

export function numCell(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = cellStr(v).replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Finds the first row (from `from`) whose joined lowercase text satisfies `pred`. */
export function findRow(rows: unknown[][], pred: (text: string) => boolean, from = 0): number {
  for (let i = from; i < rows.length; i++) {
    if (pred(rowText(rows[i]))) return i;
  }
  return -1;
}

/** Excel cells may arrive as JS Date (when read with cellDates:true), or as free-text
 * "DD.MM.YY"/"DD.MM.YYYY"/"DD/MM/YYYY" as seen in the DPR sample — normalizes to YYYY-MM-DD. */
export function parseExcelDate(cell: unknown): string | null {
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    return cell.toISOString().slice(0, 10);
  }
  const s = cellStr(cell);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? (Number(y) < 50 ? 2000 + Number(y) : 1900 + Number(y)) : Number(y);
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}
