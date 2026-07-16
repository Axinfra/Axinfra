import { renderToBuffer } from '@react-pdf/renderer';
import WorkOrderDocument from './WorkOrderDocument';
import type { WorkOrderPdfData } from './types';

export async function generateWorkOrderPdf(data: WorkOrderPdfData): Promise<Buffer> {
  return renderToBuffer(WorkOrderDocument({ data }));
}
