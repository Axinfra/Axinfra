import { renderToBuffer } from '@react-pdf/renderer';
import ChecklistDocument from './ChecklistDocument';
import type { ChecklistPdfData } from './types';

export async function generateChecklistPdf(data: ChecklistPdfData): Promise<Buffer> {
  return renderToBuffer(ChecklistDocument({ data }));
}
