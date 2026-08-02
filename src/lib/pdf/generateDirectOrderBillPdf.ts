import { renderToBuffer } from '@react-pdf/renderer';
import DirectOrderBillDocument from './DirectOrderBillDocument';
import type { DirectOrderBillPdfData } from './types';

export async function generateDirectOrderBillPdf(data: DirectOrderBillPdfData): Promise<Buffer> {
  return renderToBuffer(DirectOrderBillDocument({ data }));
}
