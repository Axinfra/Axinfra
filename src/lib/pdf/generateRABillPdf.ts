import { renderToBuffer } from '@react-pdf/renderer';
import RABillDocument from './RABillDocument';
import type { RABillPdfData } from './types';

export async function generateRABillPdf(data: RABillPdfData): Promise<Buffer> {
  return renderToBuffer(RABillDocument({ data }));
}
