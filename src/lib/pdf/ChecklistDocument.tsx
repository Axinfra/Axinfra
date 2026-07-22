import { Document, Page, View, Text } from '@react-pdf/renderer';
import { sharedPdfStyles as styles } from './theme';
import { PdfBrandHeader, MetaItem, LabeledBlock, PdfFooter, EmptyTableRow } from './components';
import type { ChecklistPdfData, ChecklistPdfItem, SignatoryInfo } from './types';

const COLS = {
  no: { width: '6%' },
  desc: { width: '40%' },
  ok: { width: '12%', textAlign: 'center' as const },
  notOk: { width: '12%', textAlign: 'center' as const },
  na: { width: '10%', textAlign: 'center' as const },
  remarks: { width: '20%' },
};

function CheckpointRow({ item, index }: { item: ChecklistPdfItem; index: number }) {
  return (
    <View style={[styles.tableRow, ...(index % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
      <Text style={[styles.td, COLS.no]}>{item.no}</Text>
      <Text style={[styles.td, COLS.desc]}>{item.description}</Text>
      {/* "X" not "✓" — the standard 14 PDF fonts only cover WinAnsiEncoding, same reason
      format.ts uses "INR " instead of the ₹ glyph. U+2713 silently renders as blank. */}
      <Text style={[styles.td, COLS.ok, { fontFamily: 'Helvetica-Bold' }]}>{item.result === 'OK' ? 'X' : ''}</Text>
      <Text style={[styles.td, COLS.notOk, { fontFamily: 'Helvetica-Bold' }]}>{item.result === 'NOT_OK' ? 'X' : ''}</Text>
      <Text style={[styles.td, COLS.na, { fontFamily: 'Helvetica-Bold' }]}>{item.result === 'NA' ? 'X' : ''}</Text>
      <Text style={[styles.td, COLS.remarks]}>{item.remarks}</Text>
    </View>
  );
}

/** Local signature box — SigBox in components.tsx always renders a blank date row (no
 * existing PDF populates a real signed date); Checklist sign-off needs the actual date, and
 * SignatureGrid is hardcoded to RA Bill's 5-role set, so this is a small local variant instead
 * of extending shared code used by other documents. */
function ChecklistSigBox({ title, info, dateFormatted }: { title: string; info: SignatoryInfo; dateFormatted: string }) {
  return (
    <View style={styles.sigBox}>
      <Text style={styles.sigTitle}>{title}</Text>
      <View style={styles.sigLine} />
      <Text style={styles.sigCaption}>Signature</Text>
      <View style={styles.sigDetailRow}>
        <Text style={styles.sigDetailLabel}>Name</Text>
        <Text style={styles.sigDetailValue}>{info.name || ' '}</Text>
      </View>
      <View style={styles.sigDetailRow}>
        <Text style={styles.sigDetailLabel}>Role</Text>
        <Text style={styles.sigDetailValue}>{info.designation || ' '}</Text>
      </View>
      <View style={styles.sigDetailRow}>
        <Text style={styles.sigDetailLabel}>Date</Text>
        <Text style={styles.sigDetailValue}>{dateFormatted || ' '}</Text>
      </View>
    </View>
  );
}

export default function ChecklistDocument({ data }: { data: ChecklistPdfData }) {
  return (
    <Document title={data.docRefNo} author="AxInfra">
      <Page size="A4" style={styles.page} wrap>
        <PdfBrandHeader logoDataUri={data.logoDataUri} title="CHECK LIST" subtitle={`${data.docRefNo} · ${data.statusLabel}`} />

        <View style={styles.metaGrid}>
          <MetaItem label="Checklist Type" value={data.title} />
          <MetaItem label="Document Ref. No." value={data.docRefNo} />
          <MetaItem label="Project" value={data.projectName} />
          <MetaItem label="Client" value={data.clientName} />
          <MetaItem label="Location" value={data.location} />
          <MetaItem label="Reference Drawing No." value={data.referenceDrawingNo} />
        </View>

        <Text style={styles.sectionTitle}>
          Check List
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, COLS.no]}>No.</Text>
            <Text style={[styles.th, COLS.desc]}>Check Points</Text>
            <Text style={[styles.th, COLS.ok]}>O.K.</Text>
            <Text style={[styles.th, COLS.notOk]}>Not O.K.</Text>
            <Text style={[styles.th, COLS.na]}>N.A.</Text>
            <Text style={[styles.th, COLS.remarks]}>Remarks</Text>
          </View>
          {data.items.length === 0 ? (
            <EmptyTableRow message="No check points on this checklist." />
          ) : (
            data.items.map((item, i) => <CheckpointRow key={item.no} item={item} index={i} />)
          )}
        </View>

        <View style={{ marginTop: 10 }} wrap={false}>
          <LabeledBlock label="Certification / Remarks by Site Engineer" value={data.certificationRemarks} />
        </View>

        <View wrap={false}>
          <Text style={styles.sectionTitle}>Signatures</Text>
          <View style={styles.sigGrid}>
            <ChecklistSigBox title="Prepared By (PMC)" info={data.preparedBy} dateFormatted="" />
            <ChecklistSigBox title="Signed By (Site Engineer)" info={data.signedBy} dateFormatted={data.signedDateFormatted} />
          </View>
        </View>

        <PdfFooter logoDataUri={data.logoDataUri} qrDataUri={data.qrDataUri} generatedAtFormatted={data.generatedAtFormatted} />
      </Page>
    </Document>
  );
}
