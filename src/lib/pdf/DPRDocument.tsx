import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { sharedPdfStyles as styles } from './theme';
import { PdfBrandHeader, MetaItem, LabeledBlock, PdfFooter, EmptyTableRow } from './components';
import type { DPRPdfData, DPRPdfProcurementRow, DPRPdfManpowerGroup, DPRPdfHighlight, DPRPdfPhoto, SignatoryInfo } from './types';

// Right-aligned numeric columns all get a little breathing room on the right — with zero
// gap, adjacent right-aligned header labels (e.g. "Consumed" / "Balance") visually run
// together since text-align:right pushes each flush to its own box edge.
const PROC_COLS = {
  no: { width: '4%' },
  material: { width: '15%' },
  desc: { width: '15%' },
  unit: { width: '6%' },
  already: { width: '10%', textAlign: 'right' as const, paddingRight: 6 },
  thisWeek: { width: '10%', textAlign: 'right' as const, paddingRight: 6 },
  cumulative: { width: '10%', textAlign: 'right' as const, paddingRight: 6 },
  consumed: { width: '10%', textAlign: 'right' as const, paddingRight: 6 },
  balance: { width: '9%', textAlign: 'right' as const, paddingRight: 6 },
  additional: { width: '11%' },
};

function ProcurementRow({ row, index }: { row: DPRPdfProcurementRow; index: number }) {
  return (
    <View style={[styles.tableRow, ...(index % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
      <Text style={[styles.td, PROC_COLS.no]}>{row.no}</Text>
      <Text style={[styles.td, PROC_COLS.material]}>{row.materialName}</Text>
      <Text style={[styles.td, PROC_COLS.desc]}>{row.description}</Text>
      <Text style={[styles.td, PROC_COLS.unit]}>{row.unit}</Text>
      <Text style={[styles.td, PROC_COLS.already]}>{row.alreadyReceived}</Text>
      <Text style={[styles.td, PROC_COLS.thisWeek]}>{row.receivedThisWeek}</Text>
      <Text style={[styles.td, PROC_COLS.cumulative]}>{row.cumulativeReceivedTillDate}</Text>
      <Text style={[styles.td, PROC_COLS.consumed]}>{row.consumedTillDate}</Text>
      <Text style={[styles.td, PROC_COLS.balance]}>{row.balanceAtSite}</Text>
      <Text style={[styles.td, PROC_COLS.additional]}>{row.additionalRequirement}</Text>
    </View>
  );
}

const MANPOWER_COLS = {
  trade: { width: '48%' },
  unit: { width: '16%' },
  actual: { width: '18%', textAlign: 'right' as const },
  planned: { width: '18%', textAlign: 'right' as const },
};

function ManpowerGroupBlock({ group }: { group: DPRPdfManpowerGroup }) {
  return (
    <View wrap={false}>
      <View style={styles.groupHeaderRow}>
        <Text style={styles.groupHeaderText}>{group.vendorName}</Text>
      </View>
      {group.rows.map((row, i) => (
        <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]}>
          <Text style={[styles.td, MANPOWER_COLS.trade]}>{row.tradeName}</Text>
          <Text style={[styles.td, MANPOWER_COLS.unit]}>{row.unit}</Text>
          <Text style={[styles.td, MANPOWER_COLS.actual]}>{row.actualCount}</Text>
          <Text style={[styles.td, MANPOWER_COLS.planned]}>{row.plannedCount}</Text>
        </View>
      ))}
    </View>
  );
}

function HighlightRow({ item }: { item: DPRPdfHighlight }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 3 }} wrap={false}>
      <Text style={[styles.td, { width: '6%', fontFamily: 'Helvetica-Bold' }]}>{item.no}</Text>
      <Text style={[styles.td, { width: '94%' }]}>{item.description}</Text>
    </View>
  );
}

function PhotoGrid({ photos }: { photos: DPRPdfPhoto[] }) {
  return (
    <View style={{ marginBottom: 4 }}>
      {photos.map((photo, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }} wrap={false}>
          <Text style={{ flex: 1, fontSize: 8, color: '#6b7280', paddingRight: 10 }}>
            {photo.remarks || `Photo ${i + 1}`}
          </Text>
          <Image src={photo.dataUri} style={{ width: 120, height: 88, objectFit: 'cover', borderRadius: 3 }} />
        </View>
      ))}
    </View>
  );
}

/** Local signature box — same reasoning as ChecklistDocument.tsx's variant: needs a real
 * signed date, and this document has a different role set than RA Bill's SignatureGrid. */
function DPRSigBox({ title, info, dateFormatted }: { title: string; info: SignatoryInfo; dateFormatted: string }) {
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

export default function DPRDocument({ data }: { data: DPRPdfData }) {
  return (
    <Document title={data.docRefNo} author="AxInfra">
      <Page size="A4" style={styles.page} wrap>
        <PdfBrandHeader logoDataUri={data.logoDataUri} title="DAILY PROGRESS REPORT" subtitle={`${data.docRefNo} · ${data.statusLabel}`} />

        <View style={styles.metaGrid}>
          <MetaItem label="Reporting Date" value={data.reportDateFormatted} />
          <MetaItem label="Period" value={data.periodFormatted} />
          <MetaItem label="Project" value={data.projectName} />
          <MetaItem label="Client" value={data.clientName} />
          <MetaItem label="Total Duration (days)" value={data.totalDurationDays !== null ? String(data.totalDurationDays) : 'Not set'} />
          <MetaItem label="Elapsed (days)" value={data.elapsedDays !== null ? String(data.elapsedDays) : 'Not set'} />
          <MetaItem label="Balance (days)" value={data.balanceDays !== null ? String(data.balanceDays) : 'Not set'} />
        </View>

        <Text style={styles.sectionTitle}>
          Procurement (Client&apos;s Supply Items) Tracking
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, PROC_COLS.no]}>No.</Text>
            <Text style={[styles.th, PROC_COLS.material]}>Material</Text>
            <Text style={[styles.th, PROC_COLS.desc]}>Description</Text>
            <Text style={[styles.th, PROC_COLS.unit]}>Unit</Text>
            <Text style={[styles.th, PROC_COLS.already]}>Already Recd.</Text>
            <Text style={[styles.th, PROC_COLS.thisWeek]}>Recd. This Week</Text>
            <Text style={[styles.th, PROC_COLS.cumulative]}>Cumm. Recd.</Text>
            <Text style={[styles.th, PROC_COLS.consumed]}>Consumed</Text>
            <Text style={[styles.th, PROC_COLS.balance]}>Balance</Text>
            <Text style={[styles.th, PROC_COLS.additional]}>Add&apos;l Req.</Text>
          </View>
          {data.procurementRows.length === 0 ? (
            <EmptyTableRow message="No procurement items tracked today." />
          ) : (
            data.procurementRows.map((row, i) => <ProcurementRow key={row.no} row={row} index={i} />)
          )}
        </View>

        <Text style={styles.sectionTitle}>
          Resources (Manpower) — Actual vs Planned
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, MANPOWER_COLS.trade]}>Trade</Text>
            <Text style={[styles.th, MANPOWER_COLS.unit]}>Unit</Text>
            <Text style={[styles.th, MANPOWER_COLS.actual]}>Actual</Text>
            <Text style={[styles.th, MANPOWER_COLS.planned]}>Planned</Text>
          </View>
          {data.manpowerGroups.length === 0 ? (
            <EmptyTableRow message="No manpower recorded today." />
          ) : (
            data.manpowerGroups.map((group) => <ManpowerGroupBlock key={group.vendorName} group={group} />)
          )}
        </View>

        <Text style={styles.sectionTitle}>Day&apos;s Highlights</Text>
        <View style={{ marginBottom: 4 }}>
          {data.highlights.length === 0 ? (
            <Text style={[styles.td, { color: '#6b7280' }]}>No highlights recorded today.</Text>
          ) : (
            data.highlights.map((h) => <HighlightRow key={h.no} item={h} />)
          )}
        </View>

        {data.criticalIssues && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>Critical Issues</Text>
            <LabeledBlock label="Flagged by Site Engineer" value={data.criticalIssues} />
          </View>
        )}

        {data.photos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Site Photos</Text>
            <PhotoGrid photos={data.photos} />
          </>
        )}

        <View wrap={false}>
          <Text style={styles.sectionTitle}>Signature</Text>
          <View style={styles.sigGrid}>
            <DPRSigBox title="Filled & Signed By (Site Engineer)" info={data.signedBy} dateFormatted={data.signedDateFormatted} />
          </View>
        </View>

        <PdfFooter logoDataUri={data.logoDataUri} qrDataUri={data.qrDataUri} generatedAtFormatted={data.generatedAtFormatted} />
      </Page>
    </Document>
  );
}
