import QRCode from 'qrcode';
import { prisma } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/utils';
import { getLogoDataUri } from './logo';
import { namesByRole } from './format';
import type { ChecklistPdfData } from './types';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  SIGNED: 'Signed',
};

/** Assembles fully display-ready PDF data for a Checklist straight off the live database.
 * Project/Client/Location aren't stored on Checklist — resolved here from Project + ProjectRole,
 * same as buildRABillPdfData.ts resolves clientName/pmcName. */
export async function buildChecklistPdfData(params: { projectId: string; checklistId: string }): Promise<ChecklistPdfData> {
  const { projectId, checklistId } = params;

  const checklist = await prisma.checklist.findFirst({
    where: { id: checklistId, projectId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      createdBy: { select: { name: true } },
      signedBy: { select: { name: true } },
    },
  });
  if (!checklist) throw new Error('Checklist not found');

  const [project, roles] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectRole.findMany({
      where: { projectId, role: { in: ['CLIENT'] } },
      include: { user: { select: { name: true } } },
    }),
  ]);
  if (!project) throw new Error('Project not found');

  const metadata = project.metadata ? JSON.parse(project.metadata) : {};

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in';
  const qrTarget = `${appUrl}/projects/${projectId}/documents/checklists/${checklistId}`;
  const qrDataUri = await QRCode.toDataURL(qrTarget, { margin: 1, width: 200 });

  return {
    docRefNo: checklist.docRefNo,
    title: checklist.title,
    projectName: project.name,
    clientName: namesByRole(roles, 'CLIENT'),
    location: metadata.location ?? '—',
    referenceDrawingNo: checklist.referenceDrawingNo,
    statusLabel: STATUS_LABELS[checklist.status] ?? checklist.status,
    items: checklist.items.map((item, i) => ({
      no: i + 1,
      description: item.description,
      result: item.result as 'OK' | 'NOT_OK' | 'NA' | null,
      remarks: item.remarks ?? '',
    })),
    certificationRemarks: checklist.certificationRemarks ?? '',
    preparedBy: { name: checklist.createdBy.name, designation: 'PMC' },
    signedBy: { name: checklist.signedBy?.name ?? '', designation: 'Site Engineer' },
    signedDateFormatted: checklist.signedAt ? formatDate(checklist.signedAt) : '',
    generatedAtFormatted: formatDateTime(new Date()),
    logoDataUri: getLogoDataUri(),
    qrDataUri,
  };
}
