import QRCode from 'qrcode';
import { prisma } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/utils';
import { getLogoDataUri } from './logo';
import { qtyFormatter, formatCurrencyForPdf, namesByRole as namesByRoleShared } from './format';
import type { RABillPdfData } from './types';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_VENDOR_REVIEW: 'Pending Certification',
  REVISION_REQUESTED: 'Needs Revision',
  CERTIFIED: 'Certified',
  APPROVED: 'Approved',
  PAID: 'Paid',
};

/** Assembles fully display-ready PDF data for an RA Bill straight off the live database — RA
 * Bills have no separate "details form" like Work Orders do, since every field the PDF needs
 * (billing period, quantities, remarks, approval trail) is already captured on the bill itself
 * as it moves through the draft → submit → certify → approve → release workflow. */
export async function buildRABillPdfData(params: { projectId: string; raBillId: string }): Promise<RABillPdfData> {
  const { projectId, raBillId } = params;

  const bill = await prisma.rABill.findFirst({
    where: { id: raBillId, projectId },
    include: {
      order: { include: { vendorUser: true, workOrder: { select: { number: true } } } },
      lineItems: { orderBy: { createdAt: 'asc' } },
      createdBy: { select: { name: true } },
      certifiedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      releasedBy: { select: { name: true } },
    },
  });
  if (!bill) throw new Error('RA Bill not found');

  const [project, roles] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectRole.findMany({
      where: { projectId, role: { in: ['CLIENT', 'PMC', 'CONSULTANT'] } },
      include: { user: { select: { name: true } } },
    }),
  ]);
  if (!project) throw new Error('Project not found');

  const namesByRole = (role: string) => namesByRoleShared(roles, role);
  const vendor = bill.order.vendorUser;

  const gross = bill.lineItems.reduce((sum, l) => sum + l.thisBillAmount, 0);
  const netPayable = bill.releasedValue ?? bill.approvedValue ?? gross;
  const deductions = bill.approvedValue !== null ? bill.deductions : null;

  const remarksParts = [
    bill.remarks,
    bill.certifiedRemarks ? `Certification remarks: ${bill.certifiedRemarks}` : null,
    bill.revisionReason ? `Revision requested: ${bill.revisionReason}` : null,
  ].filter((p): p is string => !!p && p.trim().length > 0);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in';
  const qrTarget = `${appUrl}/projects/${projectId}/orders/${bill.orderId}/ra-bills/${raBillId}`;
  const qrDataUri = await QRCode.toDataURL(qrTarget, { margin: 1, width: 200 });

  return {
    billNumber: `RA-${bill.billNumber}`,
    workOrderNumber: bill.order.workOrder?.number ?? null,
    purchaseOrderNumber: bill.order.name,
    statusLabel: STATUS_LABELS[bill.status] ?? bill.status,
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

    periodFormatted: `${formatDate(bill.periodStart)} – ${formatDate(bill.periodEnd)}`,

    lineItems: bill.lineItems.map((item, i) => {
      const executedQty = item.previousCumulativeQty + item.thisBillQty;
      return {
        itemNo: i + 1,
        description: item.description,
        unit: item.unit,
        executedQty: qtyFormatter.format(executedQty),
        previousBilledQty: qtyFormatter.format(item.previousCumulativeQty),
        currentBilledQty: qtyFormatter.format(item.thisBillQty),
        balanceQty: qtyFormatter.format(item.contractedQty - executedQty),
        rate: formatCurrencyForPdf(item.rate),
        amount: formatCurrencyForPdf(item.thisBillAmount),
      };
    }),
    totalAmountFormatted: formatCurrencyForPdf(gross),
    deductionsFormatted: deductions !== null ? formatCurrencyForPdf(deductions) : null,
    netPayableFormatted: formatCurrencyForPdf(netPayable),

    remarks: remarksParts.join('\n'),

    signatories: {
      preparedBy: { name: bill.createdBy.name, designation: '' },
      vendor: { name: vendor?.name ?? bill.createdBy.name, designation: '' },
      consultant: { name: namesByRole('CONSULTANT'), designation: '' },
      pmc: { name: namesByRole('PMC'), designation: '' },
      client: { name: bill.approvedBy?.name || namesByRole('CLIENT'), designation: '' },
    },

    generatedAtFormatted: formatDateTime(new Date()),
    logoDataUri: getLogoDataUri(),
    qrDataUri,
  };
}
