import QRCode from 'qrcode';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { getLogoDataUri } from './logo';
import { formatCurrencyForPdf, namesByRole as namesByRoleShared } from './format';
import type { DirectOrderBillPdfData } from './types';

const STATUS_LABELS: Record<string, string> = {
  ORDERED: 'Ordered',
  IN_PROGRESS: 'In Progress',
  IN_DELIVERY: 'In Delivery',
  DELIVERED: 'Delivered — Awaiting Payment',
  QTY_VARIANCE: 'Qty Variance',
  PAID: 'Paid',
};

/** Assembles fully display-ready PDF data for a Direct Order bill straight off the live
 * database. Unlike an RA Bill, a Direct Order has no line items or multi-stage approval trail —
 * one item, one ordered value, and (once generated) one billed value. */
export async function buildDirectOrderBillPdfData(params: { projectId: string; orderId: string }): Promise<DirectOrderBillPdfData> {
  const { projectId, orderId } = params;

  const order = await prisma.directOrder.findFirst({
    where: { id: orderId, projectId },
    include: {
      vendorUser: true,
      createdBy: { select: { name: true } },
    },
  });
  if (!order) throw new Error('Direct order not found');

  const [project, roles] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectRole.findMany({
      where: { projectId, role: { in: ['CLIENT', 'PMC'] } },
      include: { user: { select: { name: true } } },
    }),
  ]);
  if (!project) throw new Error('Project not found');

  const namesByRole = (role: string) => namesByRoleShared(roles, role);
  const vendor = order.vendorUser;
  const currency = project.metadata ? (JSON.parse(project.metadata).currency || 'INR') : 'INR';

  const variance = order.billedValue != null ? order.value - order.billedValue : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in';
  const qrTarget = `${appUrl}/projects/${projectId}/direct-orders`;
  const qrDataUri = await QRCode.toDataURL(qrTarget, { margin: 1, width: 200 });

  return {
    doNumber: order.doNumber,
    statusLabel: STATUS_LABELS[order.status] ?? order.status,
    projectName: project.name,
    clientName: namesByRole('CLIENT'),
    pmcName: namesByRole('PMC'),

    vendor: {
      name: vendor.name ?? '—',
      companyName: vendor.companyName ?? '—',
      contactPerson: vendor.contactPerson ?? '—',
      email: vendor.email ?? '—',
      phone: vendor.mobile ?? '—',
      address: vendor.address ?? '—',
      gstNumber: vendor.gstNumber ?? '—',
    },

    itemDescription: order.itemDescription,
    orderedValueFormatted: formatCurrencyForPdf(order.value, currency),
    billedValueFormatted: order.billedValue != null ? formatCurrencyForPdf(order.billedValue, currency) : null,
    varianceFormatted: variance != null ? `${variance > 0 ? '+' : ''}${formatCurrencyForPdf(variance, currency)}` : null,
    remarks: order.remarks ?? '',

    orderedAtFormatted: formatDateTime(order.createdAt),
    billGeneratedAtFormatted: order.billGeneratedAt ? formatDateTime(order.billGeneratedAt) : null,

    signatories: {
      preparedBy: { name: order.createdBy.name, designation: '' },
      vendor: { name: vendor.name ?? '—', designation: '' },
      pmc: { name: namesByRole('PMC'), designation: '' },
    },

    generatedAtFormatted: formatDateTime(new Date()),
    logoDataUri: getLogoDataUri(),
    qrDataUri,
  };
}
