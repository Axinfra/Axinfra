import { renderToBuffer } from '@react-pdf/renderer';
import ProjectReportDocument from './ProjectReportDocument';
import type { ProjectReportPdfData } from './types';

export async function generateProjectReportPdf(data: ProjectReportPdfData): Promise<Buffer> {
  return renderToBuffer(ProjectReportDocument({ data }));
}
