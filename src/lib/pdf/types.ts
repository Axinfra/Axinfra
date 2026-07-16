export interface WorkOrderPdfBoqItem {
  itemNo: number;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  amount: string;
}

export interface SignatoryInfo {
  name: string;
  designation: string;
}

export interface TermsAndConditions {
  payment: string;
  quality: string;
  safety: string;
  delayPenalty: string;
  warranty: string;
  other: string;
}

export interface Signatories {
  preparedBy: SignatoryInfo;
  vendor: SignatoryInfo;
  consultant: SignatoryInfo;
  pmc: SignatoryInfo;
  client: SignatoryInfo;
}

/** Narrative/terms/signatory fields the "Generate Work Order PDF" form collects — persisted
 * verbatim as WorkOrderRevision.pdfDetailsJson so regenerating reproduces the same document. */
export interface WorkOrderPdfDetails {
  workDescription: string;
  scopeOfWork: string;
  completionTimeline: string;
  paymentTerms: string;
  deliveryTerms: string;
  generalNotes: string;
  specialInstructions: string;
  taxPercent: number | null;
  termsAndConditions: TermsAndConditions;
  signatories: Signatories;
}

export function emptyPdfDetails(): WorkOrderPdfDetails {
  return {
    workDescription: '',
    scopeOfWork: '',
    completionTimeline: '',
    paymentTerms: '',
    deliveryTerms: '',
    generalNotes: '',
    specialInstructions: '',
    taxPercent: null,
    termsAndConditions: { payment: '', quality: '', safety: '', delayPenalty: '', warranty: '', other: '' },
    signatories: {
      preparedBy: { name: '', designation: '' },
      vendor: { name: '', designation: '' },
      consultant: { name: '', designation: '' },
      pmc: { name: '', designation: '' },
      client: { name: '', designation: '' },
    },
  };
}

/** Fully-resolved, display-ready data for the PDF template — every field is a formatted
 * string so WorkOrderDocument.tsx never needs to know about dates/currency/nullability. */
export interface WorkOrderPdfData {
  woNumber: string;
  revisionNumber: number;
  issueDateFormatted: string;
  projectName: string;
  clientName: string;
  consultantName: string;
  pmcName: string;

  vendor: {
    name: string;
    companyName: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    gstNumber: string;
  };

  workDescription: string;
  scopeOfWork: string;
  startDateFormatted: string;
  endDateFormatted: string;
  completionTimeline: string;
  paymentTerms: string;
  deliveryTerms: string;
  generalNotes: string;
  specialInstructions: string;

  boqItems: WorkOrderPdfBoqItem[];
  subtotalFormatted: string;
  taxLabel: string | null;
  taxAmountFormatted: string | null;
  grandTotalFormatted: string;

  termsAndConditions: TermsAndConditions;
  signatories: Signatories;

  generatedAtFormatted: string;
  logoDataUri: string;
  qrDataUri: string;
}

export interface RABillPdfLineItem {
  itemNo: number;
  description: string;
  unit: string;
  executedQty: string;
  previousBilledQty: string;
  currentBilledQty: string;
  balanceQty: string;
  rate: string;
  amount: string;
}

/** Fully-resolved, display-ready data for the RA Bill PDF template. Unlike the Work Order PDF,
 * this has no separate "details form" — everything comes straight off the RABill record and
 * its already-captured approval trail (createdBy/certifiedBy/approvedBy/releasedBy), since RA
 * Bills don't have a narrative/T&C concept the way Work Orders do. */
export interface RABillPdfData {
  billNumber: string;
  workOrderNumber: string | null;
  purchaseOrderNumber: string;
  statusLabel: string;
  projectName: string;
  clientName: string;
  consultantName: string;
  pmcName: string;

  vendor: {
    name: string;
    companyName: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    gstNumber: string;
  };

  periodFormatted: string;

  lineItems: RABillPdfLineItem[];
  totalAmountFormatted: string;
  deductionsFormatted: string | null;
  netPayableFormatted: string;

  remarks: string;

  signatories: Signatories;

  generatedAtFormatted: string;
  logoDataUri: string;
  qrDataUri: string;
}
