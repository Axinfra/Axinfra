import QRCode from 'qrcode';
import { prisma } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/utils';
import { getLogoDataUri } from './logo';
import { qtyFormatter, formatCurrencyForPdf, namesByRole as namesByRoleShared } from './format';
import type { WorkOrderPdfData, WorkOrderPdfDetails } from './types';

export interface RevisionMeta {
  revisionNumber: number;
  issueDate: Date;
  plannedStart: Date | null;
  plannedEnd: Date | null;
}

/** Assembles fully display-ready PDF data from the live database plus the caller-supplied
 * revision meta / narrative details. Meta is passed in (not re-derived from a WorkOrderRevision
 * row) because in "issue" mode the PDF is rendered *before* that row exists. */
export async function buildWorkOrderPdfData(params: {
  projectId: string;
  orderId: string;
  revisionMeta: RevisionMeta;
  details: WorkOrderPdfDetails;
  preparedByName: string;
}): Promise<WorkOrderPdfData> {
  const { projectId, orderId, revisionMeta, details, preparedByName } = params;

  const [order, project, roles, boqItems] = await Promise.all([
    prisma.phase.findFirst({
      where: { id: orderId, projectId },
      include: { vendorUser: true, workOrder: { select: { number: true } } },
    }),
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectRole.findMany({
      where: { projectId, role: { in: ['CLIENT', 'PMC', 'CONSULTANT'] } },
      include: { user: { select: { name: true } } },
    }),
    prisma.bOQItem.findMany({
      where: { boq: { orderId } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!order) throw new Error('Purchase order not found');
  if (!project) throw new Error('Project not found');

  const namesByRole = (role: string) => namesByRoleShared(roles, role);

  const vendor = order.vendorUser;
  const subtotal = boqItems.reduce((sum, item) => sum + item.plannedValue, 0);
  const taxPercent = details.taxPercent;
  const tax = taxPercent ? subtotal * (taxPercent / 100) : 0;
  const grandTotal = subtotal + tax;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in';
  const qrTarget = `${appUrl}/projects/${projectId}/orders/${orderId}`;
  const qrDataUri = await QRCode.toDataURL(qrTarget, { margin: 1, width: 200 });

  return {
    woNumber: order.workOrder?.number ?? `WO-${orderId.slice(0, 8).toUpperCase()}`,
    revisionNumber: revisionMeta.revisionNumber,
    issueDateFormatted: formatDate(revisionMeta.issueDate),
    projectName: project.name,
    clientName: namesByRole('CLIENT'),
    consultantName: namesByRole('CONSULTANT'),
    pmcName: namesByRole('PMC'),

    vendor: {
      name: vendor?.name ?? '—',
      companyName: vendor?.companyName ?? '—',
      contactPerson: vendor?.contactPerson ?? '—',
      email: vendor?.email ?? '—',
      phone: vendor?.mobile ?? '—',
      address: vendor?.address ?? '—',
      gstNumber: vendor?.gstNumber ?? '—',
    },

    workDescription: details.workDescription,
    scopeOfWork: details.scopeOfWork,
    startDateFormatted: formatDate(revisionMeta.plannedStart),
    endDateFormatted: formatDate(revisionMeta.plannedEnd),
    completionTimeline: details.completionTimeline,
    paymentTerms: details.paymentTerms,
    deliveryTerms: details.deliveryTerms,
    generalNotes: details.generalNotes,
    specialInstructions: details.specialInstructions,

    boqItems: boqItems.map((item, i) => ({
      itemNo: i + 1,
      description: item.description,
      unit: item.unit,
      quantity: qtyFormatter.format(item.plannedQty),
      rate: formatCurrencyForPdf(item.rate),
      amount: formatCurrencyForPdf(item.plannedValue),
    })),
    subtotalFormatted: formatCurrencyForPdf(subtotal),
    taxLabel: taxPercent ? `Tax (${taxPercent}%)` : null,
    taxAmountFormatted: taxPercent ? formatCurrencyForPdf(tax) : null,
    grandTotalFormatted: formatCurrencyForPdf(grandTotal),

    termsAndConditions: details.termsAndConditions,
    signatories: {
      preparedBy: {
        name: details.signatories.preparedBy.name || preparedByName,
        designation: details.signatories.preparedBy.designation,
      },
      vendor: {
        name: details.signatories.vendor.name || vendor?.name || '',
        designation: details.signatories.vendor.designation,
      },
      consultant: {
        name: details.signatories.consultant.name || namesByRole('CONSULTANT'),
        designation: details.signatories.consultant.designation,
      },
      pmc: {
        name: details.signatories.pmc.name || namesByRole('PMC'),
        designation: details.signatories.pmc.designation,
      },
      client: {
        name: details.signatories.client.name || namesByRole('CLIENT'),
        designation: details.signatories.client.designation,
      },
    },

    generatedAtFormatted: formatDateTime(new Date()),
    logoDataUri: getLogoDataUri(),
    qrDataUri,
  };
}
