import { renderToBuffer } from '@react-pdf/renderer';
import DPRDocument from './DPRDocument';
import type { DPRPdfData } from './types';

export async function generateDPRPdf(data: DPRPdfData): Promise<Buffer> {
  return renderToBuffer(DPRDocument({ data }));
}
