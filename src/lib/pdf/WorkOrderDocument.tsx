import { Document, Page, View, Text } from '@react-pdf/renderer';
import { sharedPdfStyles as styles } from './theme';
import { PdfBrandHeader, MetaItem, PanelItem, LabeledBlock, SignatureGrid, PdfFooter, EmptyTableRow } from './components';
import type { WorkOrderPdfData, WorkOrderPdfBoqItem } from './types';

function TCBlock({ label, value }: { label: string; value: string }) {
  return <LabeledBlock label={label} value={value} />;
}

function BoqRow({ item, index }: { item: WorkOrderPdfBoqItem; index: number }) {
  return (
    <View style={[styles.tableRow, ...(index % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
      <Text style={[styles.td, { width: '7%' }]}>{item.itemNo}</Text>
      <Text style={[styles.td, { width: '39%' }]}>{item.description}</Text>
      <Text style={[styles.td, { width: '10%' }]}>{item.unit}</Text>
      <Text style={[styles.td, { width: '13%', textAlign: 'right' }]}>{item.quantity}</Text>
      <Text style={[styles.td, { width: '14%', textAlign: 'right' }]}>{item.rate}</Text>
      <Text style={[styles.td, { width: '17%', textAlign: 'right' }]}>{item.amount}</Text>
    </View>
  );
}

export default function WorkOrderDocument({ data }: { data: WorkOrderPdfData }) {
  return (
    <Document title={`${data.woNumber}-Rev-${data.revisionNumber}`} author="AxInfra">
      <Page size="A4" style={styles.page} wrap>
        <PdfBrandHeader logoDataUri={data.logoDataUri} title="WORK ORDER" subtitle={`${data.woNumber} · Revision ${data.revisionNumber}`} />

        <View style={styles.metaGrid}>
          <MetaItem label="Work Order Number" value={data.woNumber} />
          <MetaItem label="Revision Number" value={`R${data.revisionNumber}`} />
          <MetaItem label="Date of Issue" value={data.issueDateFormatted} />
          <MetaItem label="Project Name" value={data.projectName} />
          <MetaItem label="Client Name" value={data.clientName} />
          <MetaItem label="Consultant Name" value={data.consultantName} />
          <MetaItem label="PMC Name" value={data.pmcName} />
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

        {/* Work Order Details */}
        <Text style={styles.sectionTitle}>Work Order Details</Text>
        <View style={styles.panel}>
          <View style={styles.panelGrid}>
            <PanelItem label="Start Date" value={data.startDateFormatted} />
            <PanelItem label="End Date" value={data.endDateFormatted} />
            <PanelItem label="Completion Timeline" value={data.completionTimeline} />
            <PanelItem label="Payment Terms" value={data.paymentTerms} />
            <PanelItem label="Delivery Terms" value={data.deliveryTerms} full />
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          <LabeledBlock label="Work Description" value={data.workDescription} />
          <LabeledBlock label="Scope of Work" value={data.scopeOfWork} />
          <LabeledBlock label="General Notes" value={data.generalNotes} />
          <LabeledBlock label="Special Instructions" value={data.specialInstructions} />
        </View>

        {/* BOQ */}
        <Text style={styles.sectionTitle}>Bill of Quantities</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { width: '7%' }]}>Item No.</Text>
            <Text style={[styles.th, { width: '39%' }]}>Description</Text>
            <Text style={[styles.th, { width: '10%' }]}>Unit</Text>
            <Text style={[styles.th, { width: '13%', textAlign: 'right' }]}>Quantity</Text>
            <Text style={[styles.th, { width: '14%', textAlign: 'right' }]}>Rate</Text>
            <Text style={[styles.th, { width: '17%', textAlign: 'right' }]}>Amount</Text>
          </View>
          {data.boqItems.length === 0 ? (
            <EmptyTableRow message="No BOQ items are linked to this Purchase Order." />
          ) : (
            data.boqItems.map((item, i) => <BoqRow key={item.itemNo} item={item} index={i} />)
          )}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{data.subtotalFormatted}</Text>
          </View>
          {data.taxLabel && data.taxAmountFormatted && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{data.taxLabel}</Text>
              <Text style={styles.totalsValue}>{data.taxAmountFormatted}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalValue}>{data.grandTotalFormatted}</Text>
          </View>
        </View>

        {/* Terms & Conditions */}
        <Text style={styles.sectionTitle}>Terms &amp; Conditions</Text>
        <View wrap={false}>
          <TCBlock label="Payment Terms" value={data.termsAndConditions.payment} />
          <TCBlock label="Quality Requirements" value={data.termsAndConditions.quality} />
          <TCBlock label="Safety Requirements" value={data.termsAndConditions.safety} />
        </View>
        <View wrap={false}>
          <TCBlock label="Delay Penalties" value={data.termsAndConditions.delayPenalty} />
          <TCBlock label="Warranty" value={data.termsAndConditions.warranty} />
          <TCBlock label="Other Conditions" value={data.termsAndConditions.other} />
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
