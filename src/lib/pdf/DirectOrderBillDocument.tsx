import { Document, Page, View, Text } from '@react-pdf/renderer';
import { sharedPdfStyles as styles } from './theme';
import { PdfBrandHeader, MetaItem, PanelItem, LabeledBlock, SigBox, PdfFooter } from './components';
import type { DirectOrderBillPdfData } from './types';

export default function DirectOrderBillDocument({ data }: { data: DirectOrderBillPdfData }) {
  return (
    <Document title={data.doNumber} author="AxInfra">
      <Page size="A4" style={styles.page} wrap>
        <PdfBrandHeader logoDataUri={data.logoDataUri} title="DIRECT ORDER BILL" subtitle={`${data.doNumber} · ${data.statusLabel}`} />

        <View style={styles.metaGrid}>
          <MetaItem label="DO Number" value={data.doNumber} />
          <MetaItem label="Project Name" value={data.projectName} />
          <MetaItem label="Client Name" value={data.clientName} />
          <MetaItem label="PMC Name" value={data.pmcName} />
          <MetaItem label="Ordered On" value={data.orderedAtFormatted} />
          <MetaItem label="Status" value={data.statusLabel} />
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

        {/* Order Details */}
        <Text style={styles.sectionTitle}>Order Details</Text>
        <View style={styles.panel}>
          <View style={styles.panelGrid}>
            <PanelItem label="Item" value={data.itemDescription} full />
            <PanelItem label="Ordered Value" value={data.orderedValueFormatted} />
            <PanelItem label="Billed Value" value={data.billedValueFormatted ?? 'Not yet billed'} />
            <PanelItem label="Variance" value={data.varianceFormatted ?? '—'} />
            <PanelItem label="Bill Generated On" value={data.billGeneratedAtFormatted ?? '—'} />
          </View>
        </View>

        <View style={{ marginTop: 8 }} wrap={false}>
          <LabeledBlock label="Remarks" value={data.remarks} />
        </View>

        {/* Signatures */}
        <View wrap={false}>
          <Text style={styles.sectionTitle}>Signatures</Text>
          <View style={styles.sigGrid}>
            <SigBox title="Prepared By" info={data.signatories.preparedBy} />
            <SigBox title="Vendor" info={data.signatories.vendor} />
            <SigBox title="PMC" info={data.signatories.pmc} />
          </View>
        </View>

        <PdfFooter logoDataUri={data.logoDataUri} qrDataUri={data.qrDataUri} generatedAtFormatted={data.generatedAtFormatted} />
      </Page>
    </Document>
  );
}
