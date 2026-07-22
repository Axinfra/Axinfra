import { cellStr, rowText } from './shared';

export interface ParsedChecklistExcel {
  title: string;
  referenceDrawingNo: string;
  items: string[];
}

/** Reads a filled-in checklist Excel (matching the demo Waterproofing/MEP template layout:
 * title row, "Reference Drawing no:" label row, a "Check points" table header, one check
 * point per row until a "Certification" row) and pulls out the fields the create-checklist
 * form needs. Label-based scanning rather than fixed row indices, since real uploads won't
 * match the sample's exact row numbers. */
export function parseChecklistExcel(rows: unknown[][]): ParsedChecklistExcel {
  let title = '';
  let referenceDrawingNo = '';
  let checkPointsHeaderIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const text = rowText(row);

    const isLabelRow = text.includes('check list') || text.includes('document ref')
      || text.includes('project:') || text.includes('client:') || text.includes('location:') || text.includes('reference drawing');
    if (!title && i > 0 && !isLabelRow) {
      const firstNonEmpty = row.find((c) => cellStr(c));
      if (firstNonEmpty !== undefined) title = cellStr(firstNonEmpty);
    }

    if (!referenceDrawingNo && text.includes('reference drawing')) {
      const labelIdx = row.findIndex((c) => cellStr(c).toLowerCase().includes('reference drawing'));
      for (let c = labelIdx + 1; c < row.length; c++) {
        if (cellStr(row[c])) { referenceDrawingNo = cellStr(row[c]); break; }
      }
    }

    if (text.includes('check points')) {
      checkPointsHeaderIdx = i;
      break;
    }
  }

  const items: string[] = [];
  if (checkPointsHeaderIdx >= 0) {
    for (let i = checkPointsHeaderIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (rowText(row).includes('certification')) break;
      const desc = cellStr(row[0]);
      if (desc) items.push(desc);
    }
  }

  return { title, referenceDrawingNo, items };
}
