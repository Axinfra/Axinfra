import { Document, Page, View, Text } from '@react-pdf/renderer';
import { sharedPdfStyles as styles } from './theme';
import { PdfBrandHeader, MetaItem, PanelItem, LabeledBlock, SignatureGrid, PdfFooter, EmptyTableRow } from './components';
import type { RABillPdfData, RABillPdfLineItem } from './types';

const COLS = {
  no: { width: '5%' },
  desc: { width: '21%' },
  unit: { width: '6%' },
  executed: { width: '11%', textAlign: 'right' as const },
  prev: { width: '11%', textAlign: 'right' as const },
  curr: { width: '11%', textAlign: 'right' as const },
  balance: { width: '11%', textAlign: 'right' as const },
  rate: { width: '11%', textAlign: 'right' as const },
  amount: { width: '13%', textAlign: 'right' as const },
};

function LineItemRow({ item, index }: { item: RABillPdfLineItem; index: number }) {
  return (
    <View style={[styles.tableRow, ...(index % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
      <Text style={[styles.td, COLS.no]}>{item.itemNo}</Text>
      <Text style={[styles.td, COLS.desc]}>{item.description}</Text>
      <Text style={[styles.td, COLS.unit]}>{item.unit}</Text>
      <Text style={[styles.td, COLS.executed]}>{item.executedQty}</Text>
      <Text style={[styles.td, COLS.prev]}>{item.previousBilledQty}</Text>
      <Text style={[styles.td, COLS.curr]}>{item.currentBilledQty}</Text>
      <Text style={[styles.td, COLS.balance]}>{item.balanceQty}</Text>
      <Text style={[styles.td, COLS.rate]}>{item.rate}</Text>
      <Text style={[styles.td, COLS.amount]}>{item.amount}</Text>
    </View>
  );
}

export default function RABillDocument({ data }: { data: RABillPdfData }) {
  return (
    <Document title={data.billNumber} author="AxInfra">
      <Page size="A4" style={styles.page} wrap>
        <PdfBrandHeader logoDataUri={data.logoDataUri} title="RA BILL" subtitle={`${data.billNumber} · ${data.statusLabel}`} />

        <View style={styles.metaGrid}>
          <MetaItem label="RA Bill Number" value={data.billNumber} />
          <MetaItem label="Work Order Number" value={data.workOrderNumber ?? '—'} />
          <MetaItem label="Purchase Order" value={data.purchaseOrderNumber} />
          <MetaItem label="Project Name" value={data.projectName} />
          <MetaItem label="Client Name" value={data.clientName} />
          <MetaItem label="Consultant Name" value={data.consultantName} />
          <MetaItem label="PMC Name" value={data.pmcName} />
          <MetaItem label="Billing Period" value={data.periodFormatted} />
          <MetaItem label="Approval Status" value={data.statusLabel} />
        </View>

        {/* Vendor Information */}
        <Text style={styles.sectionTitle}>Vendor Information</Text>
        <View style={styles.panel}>
          <View style={styles.panelGrid}>
            <PanelItem label="Vendor Name" value={data.vendor.name} />
            <PanelItem label="Company Name" value={data.vendor.companyName} />
            <PanelItem label="Contact Person" value={data.vendor.contactPerson} />
            <PanelItem label="Email" value={data.vendor.email} />
            <PanelItem label="Phone Number" value={data.vendor.phone} />
            <PanelItem label="GST Number" value={data.vendor.gstNumber} />
            <PanelItem label="Address" value={data.vendor.address} full />
          </View>
        </View>

        {/* BOQ progress */}
        <Text style={styles.sectionTitle}>BOQ-wise Progress</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, COLS.no]}>No.</Text>
            <Text style={[styles.th, COLS.desc]}>Description</Text>
            <Text style={[styles.th, COLS.unit]}>Unit</Text>
            <Text style={[styles.th, COLS.executed]}>Executed</Text>
            <Text style={[styles.th, COLS.prev]}>Prev. Billed</Text>
            <Text style={[styles.th, COLS.curr]}>This Bill</Text>
            <Text style={[styles.th, COLS.balance]}>Balance</Text>
            <Text style={[styles.th, COLS.rate]}>Rate</Text>
            <Text style={[styles.th, COLS.amount]}>Amount</Text>
          </View>
          {data.lineItems.length === 0 ? (
            <EmptyTableRow message="No BOQ line items on this bill." />
          ) : (
            data.lineItems.map((item, i) => <LineItemRow key={item.itemNo} item={item} index={i} />)
          )}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total Amount</Text>
            <Text style={styles.totalsValue}>{data.totalAmountFormatted}</Text>
          </View>
          {data.deductionsFormatted && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Taxes / Deductions</Text>
              <Text style={styles.totalsValue}>– {data.deductionsFormatted}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Net Payable</Text>
            <Text style={styles.grandTotalValue}>{data.netPayableFormatted}</Text>
          </View>
        </View>

        <View style={{ marginTop: 8 }} wrap={false}>
          <LabeledBlock label="Remarks" value={data.remarks} />
        </View>

        {/* Signatures */}
        <View wrap={false}>
          <Text style={styles.sectionTitle}>Signatures</Text>
          <SignatureGrid signatories={data.signatories} />
        </View>

        <PdfFooter logoDataUri={data.logoDataUri} qrDataUri={data.qrDataUri} generatedAtFormatted={data.generatedAtFormatted} />
      </Page>
    </Document>
  );
}
