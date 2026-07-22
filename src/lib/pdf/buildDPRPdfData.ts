import QRCode from 'qrcode';
import { prisma } from '@/lib/db';
import { fileStorage } from '@/lib/file-storage';
import { formatDate, formatDateTime } from '@/lib/utils';
import { getLogoDataUri } from './logo';
import { qtyFormatter, namesByRole } from './format';
import type { DPRPdfData, DPRPdfManpowerGroup, DPRPdfPhoto } from './types';

const STATUS_LABELS: Record<string, string> = { DRAFT: 'Draft', SIGNED: 'Signed' };

const DAY_MS = 86_400_000;
function computeDuration(startDate: string | null, endDate: string | null, reportDate: string) {
  if (!startDate || !endDate) return { totalDurationDays: null, elapsedDays: null, balanceDays: null };
  const start = new Date(startDate);
  const end = new Date(endDate);
  const today = new Date(reportDate);
  const totalDurationDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const elapsedDays = Math.round((today.getTime() - start.getTime()) / DAY_MS);
  return { totalDurationDays, elapsedDays, balanceDays: totalDurationDays - elapsedDays };
}

/** Assembles fully display-ready PDF data for a Daily Progress Report straight off the live
 * database, mirroring buildChecklistPdfData.ts's/buildRABillPdfData.ts's pattern. */
export async function buildDPRPdfData(params: { projectId: string; dprId: string }): Promise<DPRPdfData> {
  const { projectId, dprId } = params;

  const dpr = await prisma.dailyProgressReport.findFirst({
    where: { id: dprId, projectId },
    include: {
      procurementRows: { orderBy: { sortOrder: 'asc' } },
      manpowerRows: { orderBy: { sortOrder: 'asc' } },
      highlights: { orderBy: { sortOrder: 'asc' } },
      photos: { orderBy: { sortOrder: 'asc' } },
      signedBy: { select: { name: true } },
    },
  });
  if (!dpr) throw new Error('DPR not found');

  // Read each photo's bytes and embed as a data URI (same reasoning as logo.ts) — react-pdf's
  // Image needs either a public URL or a data URI, and these may live behind private storage.
  const photos: DPRPdfPhoto[] = [];
  for (const photo of dpr.photos) {
    const buffer = await fileStorage.read(photo.filePath);
    if (!buffer) continue;
    photos.push({ dataUri: `data:${photo.mimeType};base64,${buffer.toString('base64')}`, remarks: photo.remarks ?? '' });
  }

  const [project, roles] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectRole.findMany({
      where: { projectId, role: { in: ['CLIENT'] } },
      include: { user: { select: { name: true } } },
    }),
  ]);
  if (!project) throw new Error('Project not found');

  const metadata = project.metadata ? JSON.parse(project.metadata) : {};
  const duration = computeDuration(metadata.startDate ?? null, metadata.endDate ?? null, dpr.reportDate);

  // Group manpower rows by vendorName in the order they were first seen — matches how the
  // Excel sample groups a vendor's trades together under one sub-header.
  const groupOrder: string[] = [];
  const groupMap = new Map<string, DPRPdfManpowerGroup>();
  for (const row of dpr.manpowerRows) {
    if (!groupMap.has(row.vendorName)) {
      groupOrder.push(row.vendorName);
      groupMap.set(row.vendorName, { vendorName: row.vendorName, rows: [] });
    }
    groupMap.get(row.vendorName)!.rows.push({ tradeName: row.tradeName, unit: row.unit, actualCount: row.actualCount, plannedCount: row.plannedCount });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in';
  const qrTarget = `${appUrl}/projects/${projectId}/documents/dpr/${dprId}`;
  const qrDataUri = await QRCode.toDataURL(qrTarget, { margin: 1, width: 200 });

  return {
    docRefNo: dpr.docRefNo,
    reportDateFormatted: formatDate(dpr.reportDate),
    periodFormatted: dpr.periodFrom && dpr.periodTo ? `${formatDate(dpr.periodFrom)} – ${formatDate(dpr.periodTo)}` : formatDate(dpr.reportDate),
    projectName: project.name,
    clientName: namesByRole(roles, 'CLIENT'),
    statusLabel: STATUS_LABELS[dpr.status] ?? dpr.status,
    totalDurationDays: duration.totalDurationDays,
    elapsedDays: duration.elapsedDays,
    balanceDays: duration.balanceDays,
    procurementRows: dpr.procurementRows.map((r, i) => ({
      no: i + 1,
      materialName: r.materialName,
      description: r.description ?? '',
      unit: r.unit,
      alreadyReceived: qtyFormatter.format(r.alreadyReceived),
      receivedThisWeek: qtyFormatter.format(r.receivedThisWeek),
      cumulativeReceivedTillDate: qtyFormatter.format(r.cumulativeReceivedTillDate),
      consumedTillDate: qtyFormatter.format(r.consumedTillDate),
      balanceAtSite: qtyFormatter.format(r.balanceAtSite),
      additionalRequirement: r.additionalRequirement ?? '',
    })),
    manpowerGroups: groupOrder.map((v) => groupMap.get(v)!),
    highlights: dpr.highlights.map((h, i) => ({ no: `${i + 1}`, description: h.description })),
    criticalIssues: dpr.criticalIssues ?? '',
    photos,
    signedBy: { name: dpr.signedBy?.name ?? '', designation: 'Site Engineer' },
    signedDateFormatted: dpr.signedAt ? formatDate(dpr.signedAt) : '',
    generatedAtFormatted: formatDateTime(new Date()),
    logoDataUri: getLogoDataUri(),
    qrDataUri,
  };
}
