import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { sharedPdfStyles as styles, GOLD } from './theme';
import { PdfBrandHeader, MetaItem, PanelItem, LabeledBlock, PdfFooter, EmptyTableRow } from './components';
import type { ProjectReportPdfData, ReportBarDatum, ReportManpowerDayRow, ReportEvidencePhotoGroup } from './types';

const RAG_LABEL: Record<string, string> = { GREEN: 'Healthy', AMBER: 'Minor Concern', RED: 'Serious Issue' };

const ORDER_COLS = {
  name: { width: '28%' },
  planned: { width: '18%', textAlign: 'right' as const },
  submitted: { width: '18%', textAlign: 'right' as const },
  approved: { width: '18%', textAlign: 'right' as const },
  released: { width: '18%', textAlign: 'right' as const },
};

const UPDATE_COLS = {
  date: { width: '12%' },
  activity: { width: '30%' },
  // Right-aligned column immediately followed by a left-aligned one needs its own
  // paddingRight — otherwise the right-flush text butts straight into the next column's
  // left-flush text with zero gap (same fix as DPR/RA Bill document tables).
  percent: { width: '10%', textAlign: 'right' as const, paddingRight: 8 },
  author: { width: '18%' },
  remarks: { width: '30%' },
};

const BILL_COLS = {
  date: { width: '12%' },
  bill: { width: '13%' },
  order: { width: '30%' },
  stage: { width: '15%' },
  amount: { width: '30%', textAlign: 'right' as const },
};

const CHECKLIST_COLS = {
  ref: { width: '12%' },
  title: { width: '28%' },
  drawing: { width: '18%' },
  items: { width: '10%', textAlign: 'right' as const, paddingRight: 8 },
  signedBy: { width: '20%' },
  signedDate: { width: '12%' },
};

const DPR_COLS = {
  date: { width: '13%' },
  ref: { width: '12%' },
  createdBy: { width: '25%' },
  manpower: { width: '20%', textAlign: 'right' as const, paddingRight: 6 },
  highlights: { width: '15%', textAlign: 'right' as const, paddingRight: 8 },
  critical: { width: '15%' },
};

const DOC_COLS = {
  title: { width: '40%' },
  category: { width: '15%' },
  uploadedBy: { width: '25%' },
  date: { width: '20%' },
};

const ACTIVITY_ROSTER_COLS = {
  title: { width: '38%' },
  status: { width: '16%' },
  percent: { width: '12%', textAlign: 'right' as const, paddingRight: 8 },
  vendor: { width: '22%' },
  end: { width: '12%' },
};

const DRAWING_COLS = {
  serial: { width: '8%' },
  name: { width: '32%' },
  category: { width: '20%' },
  status: { width: '15%' },
  uploadedBy: { width: '15%' },
  date: { width: '10%' },
};

const BILL_ROSTER_COLS = {
  bill: { width: '13%' },
  order: { width: '27%' },
  status: { width: '16%' },
  submitted: { width: '15%', textAlign: 'right' as const, paddingRight: 6 },
  approved: { width: '15%', textAlign: 'right' as const, paddingRight: 6 },
  released: { width: '14%', textAlign: 'right' as const },
};

const CHECKLIST_ROSTER_COLS = {
  ref: { width: '14%' },
  title: { width: '38%' },
  status: { width: '18%' },
  filled: { width: '30%', textAlign: 'right' as const },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** Simple horizontal bar chart — plain percentage-width Views, no external charting library
 * or react-pdf's SVG primitives needed. Each bar's fill width is value/maxValue, clamped to
 * 100% so a stray value never overflows its track. */
function HBarChart({ data }: { data: ReportBarDatum[] }) {
  return (
    <View style={{ marginBottom: 8 }}>
      {data.map((d, i) => {
        const fillPct = d.maxValue > 0 ? Math.min(100, (d.value / d.maxValue) * 100) : 0;
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }} wrap={false}>
            <Text style={{ width: '22%', fontSize: 8, color: '#374151' }}>{d.label}</Text>
            <View style={{ width: '58%', height: 9, backgroundColor: '#efece4', borderRadius: 2 }}>
              <View style={{ width: `${fillPct}%`, height: 9, backgroundColor: d.color, borderRadius: 2 }} />
            </View>
            <Text style={{ width: '20%', fontSize: 8, textAlign: 'right', paddingLeft: 6 }}>{d.valueLabel}</Text>
          </View>
        );
      })}
    </View>
  );
}

const MANPOWER_ACTUAL_COLOR = GOLD;
const MANPOWER_PLANNED_COLOR = '#d8d3c6';

/** Day-by-day Actual vs Planned manpower trend — two stacked mini-bars per day, same
 * percentage-width technique as HBarChart, scaled to the largest single value in the period. */
function ManpowerTrendChart({ rows }: { rows: ReportManpowerDayRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.planned)));
  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        <View style={{ width: 8, height: 8, backgroundColor: MANPOWER_ACTUAL_COLOR, marginRight: 4 }} />
        <Text style={{ fontSize: 8, color: '#6b7280', marginRight: 10 }}>Actual</Text>
        <View style={{ width: 8, height: 8, backgroundColor: MANPOWER_PLANNED_COLOR, marginRight: 4 }} />
        <Text style={{ fontSize: 8, color: '#6b7280' }}>Planned</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }} wrap={false}>
          <Text style={{ width: '14%', fontSize: 8 }}>{r.dateFormatted}</Text>
          <View style={{ width: '66%' }}>
            <View style={{ width: `${(r.actual / max) * 100}%`, height: 6, backgroundColor: MANPOWER_ACTUAL_COLOR, marginBottom: 2, borderRadius: 1 }} />
            <View style={{ width: `${(r.planned / max) * 100}%`, height: 6, backgroundColor: MANPOWER_PLANNED_COLOR, borderRadius: 1 }} />
          </View>
          <Text style={{ width: '20%', fontSize: 8, textAlign: 'right', paddingLeft: 6 }}>{r.actual}/{r.planned}</Text>
        </View>
      ))}
    </View>
  );
}

/** One activity's evidence photo submission — header line (who/when/role) then a 3-per-row
 * photo grid, same layout technique as DPRDocument.tsx's PhotoGrid. */
function EvidencePhotoBlock({ group }: { group: ReportEvidencePhotoGroup }) {
  return (
    <View style={{ marginBottom: 12 }} wrap={false}>
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{group.activityTitle}</Text>
      <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 4 }}>
        {group.submittedByName} ({group.authorRoleLabel}) · {group.dateFormatted}{group.remarks ? ` — ${group.remarks}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {group.photos.map((photo, i) => (
          <View key={i} style={{ width: '31%', marginRight: '2%', marginBottom: 8 }}>
            <Image src={photo.dataUri} style={{ width: '100%', height: 85, objectFit: 'cover', borderRadius: 3 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ProjectReportDocument({ data }: { data: ProjectReportPdfData }) {
  return (
    <Document title={`${data.projectName} - ${data.periodTypeLabel} Report`} author="AxInfra">
      <Page size="A4" style={styles.page} wrap>
        <PdfBrandHeader
          logoDataUri={data.logoDataUri}
          title="PROJECT REPORT"
          subtitle={`${data.periodTypeLabel} · ${data.periodLabel}`}
        />

        <View style={styles.metaGrid}>
          <MetaItem label="Project" value={data.projectName} />
          <MetaItem label="Client" value={data.clientName} />
          <MetaItem label="PMC" value={data.pmcName} />
          <MetaItem label="Consultant" value={data.consultantName} />
          <MetaItem label="Report Type" value={data.periodTypeLabel} />
          <MetaItem label="Period" value={data.periodLabel} />
        </View>

        <Section title="1. Executive Summary">
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>1.1 Progress Dashboard (at reporting date)</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, { width: '34%' }]}>Key Indicator</Text>
              <Text style={[styles.th, { width: '22%' }]}>Planned</Text>
              <Text style={[styles.th, { width: '22%' }]}>Actual</Text>
              <Text style={[styles.th, { width: '22%' }]}>Variance</Text>
            </View>
            {data.dashboard.map((row, i) => (
              <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                <Text style={[styles.td, { width: '34%' }]}>{row.label}</Text>
                <Text style={[styles.td, { width: '22%' }]}>{row.plannedFormatted}</Text>
                <Text style={[styles.td, { width: '22%' }]}>{row.actualFormatted}</Text>
                <Text style={[styles.td, { width: '22%' }]}>{row.varianceFormatted}</Text>
              </View>
            ))}
            <View style={[styles.tableRow, { backgroundColor: '#f3f1ec' }]} wrap={false}>
              <Text style={[styles.td, { width: '34%', fontFamily: 'Helvetica-Bold' }]}>Schedule Status</Text>
              <Text style={[styles.td, { width: '66%', fontFamily: 'Helvetica-Bold' }]}>{data.scheduleStatusLabel}</Text>
            </View>
          </View>

          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>1.2 Health Flags</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, { width: '20%' }]}>Area</Text>
              <Text style={[styles.th, { width: '20%' }]}>Status</Text>
              <Text style={[styles.th, { width: '60%' }]}>Remark</Text>
            </View>
            {data.healthFlags.map((flag, i) => (
              <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                <Text style={[styles.td, { width: '20%' }]}>{flag.area}</Text>
                <Text style={[styles.td, { width: '20%', color: flag.status === 'RED' ? '#e06050' : flag.status === 'AMBER' ? '#b3943f' : '#5cba80', fontFamily: 'Helvetica-Bold' }]}>{RAG_LABEL[flag.status] ?? flag.status}</Text>
                <Text style={[styles.td, { width: '60%' }]}>{flag.remark}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>1.3 Key Numbers</Text>
          <View style={styles.panel}>
            <View style={styles.panelGrid}>
              {data.keyStats.map((stat) => (
                <PanelItem key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </View>
          </View>
        </Section>

        <Section title="2. Project Particulars">
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>2.1 General Details</Text>
          <View style={{ flexDirection: 'row', marginBottom: 6 }} wrap={false}>
            <Text style={[styles.td, { width: '25%' }]}>Status: {data.overview.status}</Text>
            <Text style={[styles.td, { width: '25%' }]}>Location: {data.overview.location || '—'}</Text>
            <Text style={[styles.td, { width: '16.6%' }]}>Total Duration: {data.overview.totalDurationDays ?? 'Not set'}</Text>
            <Text style={[styles.td, { width: '16.6%' }]}>Elapsed: {data.overview.elapsedDays ?? 'Not set'}</Text>
            <Text style={[styles.td, { width: '16.6%' }]}>Balance: {data.overview.balanceDays ?? 'Not set'}</Text>
          </View>
          {data.overview.description && <LabeledBlock label="Scope of Work" value={data.overview.description} />}

          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>2.2 Project Stakeholders</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, { width: '40%' }]}>Role</Text>
              <Text style={[styles.th, { width: '60%' }]}>Organisation / Name</Text>
            </View>
            {data.stakeholders.map((s, i) => (
              <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                <Text style={[styles.td, { width: '40%' }]}>{s.role}</Text>
                <Text style={[styles.td, { width: '60%' }]}>{s.name || '—'}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="3. Physical Progress">
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>3.1 Milestone Status</Text>
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            <Text style={[styles.td, { width: '16.6%' }]}>Total: {data.execution.totalActivities}</Text>
            <Text style={[styles.td, { width: '16.6%' }]}>Done: {data.execution.doneCount}</Text>
            <Text style={[styles.td, { width: '16.6%' }]}>In Progress: {data.execution.inProgressCount}</Text>
            <Text style={[styles.td, { width: '16.6%' }]}>Submitted: {data.execution.submittedCount}</Text>
            <Text style={[styles.td, { width: '16.6%' }]}>Draft: {data.execution.draftCount}</Text>
            <Text style={[styles.td, { width: '16.6%' }]}>Verified: {data.execution.verifiedPercentFormatted}</Text>
          </View>
          <HBarChart data={data.execution.stateChart} />
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>Progress updates this period</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, UPDATE_COLS.date]}>Date</Text>
              <Text style={[styles.th, UPDATE_COLS.activity]}>Activity</Text>
              <Text style={[styles.th, UPDATE_COLS.percent]}>%</Text>
              <Text style={[styles.th, UPDATE_COLS.author]}>By</Text>
              <Text style={[styles.th, UPDATE_COLS.remarks]}>Remarks</Text>
            </View>
            {data.execution.progressUpdates.length === 0 ? (
              <EmptyTableRow message="No progress updates recorded this period." />
            ) : (
              data.execution.progressUpdates.map((u, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, UPDATE_COLS.date]}>{u.dateFormatted}</Text>
                  <Text style={[styles.td, UPDATE_COLS.activity]}>{u.activityTitle}</Text>
                  <Text style={[styles.td, UPDATE_COLS.percent]}>{u.percentComplete}</Text>
                  <Text style={[styles.td, UPDATE_COLS.author]}>{u.authorName}</Text>
                  <Text style={[styles.td, UPDATE_COLS.remarks]}>{u.remarks}</Text>
                </View>
              ))
            )}
          </View>
          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>Due this period — Completed / Ongoing / Undone</Text>
          <HBarChart data={data.execution.dueThisPeriodChart} />
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.title]}>Activity</Text>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.status]}>Status</Text>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.percent]}>%</Text>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.vendor]}>Vendor</Text>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.end]}>Planned End</Text>
            </View>
            {data.execution.dueThisPeriod.length === 0 ? (
              <EmptyTableRow message="No activities were due this period." />
            ) : (
              data.execution.dueThisPeriod.map((a, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.title]}>{a.title}</Text>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.status]}>{a.statusLabel}</Text>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.percent]}>{a.percentComplete}%</Text>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.vendor]}>{a.vendorName}</Text>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.end]}>{a.plannedEndFormatted}</Text>
                </View>
              ))
            )}
          </View>
          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>All activities on this project</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.title]}>Activity</Text>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.status]}>Status</Text>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.percent]}>%</Text>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.vendor]}>Vendor</Text>
              <Text style={[styles.th, ACTIVITY_ROSTER_COLS.end]}>Planned End</Text>
            </View>
            {data.execution.allActivities.length === 0 ? (
              <EmptyTableRow message="No activities on this project." />
            ) : (
              data.execution.allActivities.map((a, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.title]}>{a.title}</Text>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.status]}>{a.statusLabel}</Text>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.percent]}>{a.percentComplete}%</Text>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.vendor]}>{a.vendorName}</Text>
                  <Text style={[styles.td, ACTIVITY_ROSTER_COLS.end]}>{a.plannedEndFormatted}</Text>
                </View>
              ))
            )}
          </View>
        </Section>

        <Section title="4. Financial Progress">
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>4.1 Contract Value &amp; Billing Summary — % of planned value released, by order</Text>
          <HBarChart data={data.financial.progressChart} />
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, ORDER_COLS.name]}>Order</Text>
              <Text style={[styles.th, ORDER_COLS.planned]}>Planned</Text>
              <Text style={[styles.th, ORDER_COLS.submitted]}>Submitted</Text>
              <Text style={[styles.th, ORDER_COLS.approved]}>Approved</Text>
              <Text style={[styles.th, ORDER_COLS.released]}>Released</Text>
            </View>
            {data.financial.byOrder.length === 0 ? (
              <EmptyTableRow message="No purchase orders on this project." />
            ) : (
              data.financial.byOrder.map((o, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, ORDER_COLS.name]}>{o.orderName}</Text>
                  <Text style={[styles.td, ORDER_COLS.planned]}>{o.plannedValueFormatted}</Text>
                  <Text style={[styles.td, ORDER_COLS.submitted]}>{o.submittedValueFormatted}</Text>
                  <Text style={[styles.td, ORDER_COLS.approved]}>{o.approvedValueFormatted}</Text>
                  <Text style={[styles.td, ORDER_COLS.released]}>{o.releasedValueFormatted}</Text>
                </View>
              ))
            )}
            {data.financial.byOrder.length > 0 && (
              <View style={[styles.tableRow, { backgroundColor: '#f3f1ec' }]} wrap={false}>
                <Text style={[styles.td, ORDER_COLS.name, { fontFamily: 'Helvetica-Bold' }]}>Total</Text>
                <Text style={[styles.td, ORDER_COLS.planned, { fontFamily: 'Helvetica-Bold' }]}>{data.financial.totals.totalPlannedValueFormatted}</Text>
                <Text style={[styles.td, ORDER_COLS.submitted, { fontFamily: 'Helvetica-Bold' }]}>{data.financial.totals.totalSubmittedValueFormatted}</Text>
                <Text style={[styles.td, ORDER_COLS.approved, { fontFamily: 'Helvetica-Bold' }]}>{data.financial.totals.totalApprovedValueFormatted}</Text>
                <Text style={[styles.td, ORDER_COLS.released, { fontFamily: 'Helvetica-Bold' }]}>{data.financial.totals.totalReleasedValueFormatted}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>4.2 Running Account (RA) Bill Status — touched this period</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, BILL_COLS.date]}>Date</Text>
              <Text style={[styles.th, BILL_COLS.bill]}>Bill</Text>
              <Text style={[styles.th, BILL_COLS.order]}>Order</Text>
              <Text style={[styles.th, BILL_COLS.stage]}>Stage</Text>
              <Text style={[styles.th, BILL_COLS.amount]}>Amount</Text>
            </View>
            {data.payments.events.length === 0 ? (
              <EmptyTableRow message="No RA Bill activity this period." />
            ) : (
              data.payments.events.map((e, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, BILL_COLS.date]}>{e.dateFormatted}</Text>
                  <Text style={[styles.td, BILL_COLS.bill]}>{e.billLabel}</Text>
                  <Text style={[styles.td, BILL_COLS.order]}>{e.orderName}</Text>
                  <Text style={[styles.td, BILL_COLS.stage]}>{e.stage}</Text>
                  <Text style={[styles.td, BILL_COLS.amount]}>{e.amountFormatted}</Text>
                </View>
              ))
            )}
          </View>
          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>4.3 All RA Bills on this project</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, BILL_ROSTER_COLS.bill]}>Bill</Text>
              <Text style={[styles.th, BILL_ROSTER_COLS.order]}>Order</Text>
              <Text style={[styles.th, BILL_ROSTER_COLS.status]}>Status</Text>
              <Text style={[styles.th, BILL_ROSTER_COLS.submitted]}>Submitted</Text>
              <Text style={[styles.th, BILL_ROSTER_COLS.approved]}>Approved</Text>
              <Text style={[styles.th, BILL_ROSTER_COLS.released]}>Released</Text>
            </View>
            {data.payments.allBills.length === 0 ? (
              <EmptyTableRow message="No RA Bills on this project." />
            ) : (
              data.payments.allBills.map((b, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, BILL_ROSTER_COLS.bill]}>{b.billLabel}</Text>
                  <Text style={[styles.td, BILL_ROSTER_COLS.order]}>{b.orderName}</Text>
                  <Text style={[styles.td, BILL_ROSTER_COLS.status]}>{b.statusLabel}</Text>
                  <Text style={[styles.td, BILL_ROSTER_COLS.submitted]}>{b.submittedValueFormatted}</Text>
                  <Text style={[styles.td, BILL_ROSTER_COLS.approved]}>{b.approvedValueFormatted}</Text>
                  <Text style={[styles.td, BILL_ROSTER_COLS.released]}>{b.releasedValueFormatted}</Text>
                </View>
              ))
            )}
          </View>
        </Section>

        <Section title="5. Resource Deployment">
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>
            5.1 Manpower Deployment — Filed: {data.dpr.reportsFiledCount}/{data.dpr.calendarDaysInPeriod} days · Manpower (Actual/Planned): {data.dpr.manpowerActualTotal}/{data.dpr.manpowerPlannedTotal} · Highlights: {data.dpr.highlightsTotal} · Photos: {data.dpr.photosTotal}
          </Text>
          {data.dpr.manpowerByDay.length > 0 && (
            <>
              <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>Manpower trend — Actual vs Planned, by day</Text>
              <ManpowerTrendChart rows={data.dpr.manpowerByDay} />
            </>
          )}
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, DPR_COLS.date]}>Date</Text>
              <Text style={[styles.th, DPR_COLS.ref]}>Ref No.</Text>
              <Text style={[styles.th, DPR_COLS.createdBy]}>Filed By</Text>
              <Text style={[styles.th, DPR_COLS.manpower]}>Manpower (A/P)</Text>
              <Text style={[styles.th, DPR_COLS.highlights]}>Highlights</Text>
              <Text style={[styles.th, DPR_COLS.critical]}>Critical Issues</Text>
            </View>
            {data.dpr.reports.length === 0 ? (
              <EmptyTableRow message="No DPRs filed this period." />
            ) : (
              data.dpr.reports.map((r, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, DPR_COLS.date]}>{r.reportDateFormatted}</Text>
                  <Text style={[styles.td, DPR_COLS.ref]}>{r.docRefNo}</Text>
                  <Text style={[styles.td, DPR_COLS.createdBy]}>{r.createdByName}</Text>
                  <Text style={[styles.td, DPR_COLS.manpower]}>{r.manpowerActual}/{r.manpowerPlanned}</Text>
                  <Text style={[styles.td, DPR_COLS.highlights]}>{r.highlightsCount}</Text>
                  <Text style={[styles.td, DPR_COLS.critical]}>{r.hasCriticalIssues ? 'Yes' : '—'}</Text>
                </View>
              ))
            )}
          </View>
          {data.dpr.criticalIssueReports.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={[styles.td, { fontFamily: 'Helvetica-Bold', marginBottom: 3 }]}>Critical Issues Flagged</Text>
              {data.dpr.criticalIssueReports.map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', marginBottom: 3 }} wrap={false}>
                  <Text style={[styles.td, { width: '20%', color: '#6b7280' }]}>{r.reportDateFormatted} · {r.docRefNo}</Text>
                  <Text style={[styles.td, { width: '80%' }]}>{r.criticalIssues}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>5.2 Key Raw Materials — Procurement &amp; Stock</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, { width: '28%' }]}>Material</Text>
              <Text style={[styles.th, { width: '10%' }]}>Unit</Text>
              <Text style={[styles.th, { width: '18%', textAlign: 'right', paddingRight: 6 }]}>Recd. (Period)</Text>
              <Text style={[styles.th, { width: '18%', textAlign: 'right', paddingRight: 6 }]}>Recd. (Cum.)</Text>
              <Text style={[styles.th, { width: '13%', textAlign: 'right', paddingRight: 6 }]}>Consumed</Text>
              <Text style={[styles.th, { width: '13%', textAlign: 'right' }]}>Balance</Text>
            </View>
            {data.materials.length === 0 ? (
              <EmptyTableRow message="No procurement recorded this period." />
            ) : (
              data.materials.map((m, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, { width: '28%' }]}>{m.materialName}</Text>
                  <Text style={[styles.td, { width: '10%' }]}>{m.unit}</Text>
                  <Text style={[styles.td, { width: '18%', textAlign: 'right', paddingRight: 6 }]}>{m.receivedThisPeriod}</Text>
                  <Text style={[styles.td, { width: '18%', textAlign: 'right', paddingRight: 6 }]}>{m.cumulativeReceived}</Text>
                  <Text style={[styles.td, { width: '13%', textAlign: 'right', paddingRight: 6 }]}>{m.consumedTillDate}</Text>
                  <Text style={[styles.td, { width: '13%', textAlign: 'right' }]}>{m.balanceAtSite}</Text>
                </View>
              ))
            )}
          </View>
        </Section>

        <Section title="6. Quality Management (QA/QC)">
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>
            6.1 Checklist / Inspection Summary — Created: {data.checklists.createdCount} · Signed: {data.checklists.signedCount} · O.K.: {data.checklists.okCount} · Not O.K.: {data.checklists.notOkCount} · N.A.: {data.checklists.naCount}
          </Text>
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>Check-point results, all-time across every checklist</Text>
          <HBarChart data={data.checklists.resultChart} />
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, CHECKLIST_COLS.ref]}>Ref No.</Text>
              <Text style={[styles.th, CHECKLIST_COLS.title]}>Title</Text>
              <Text style={[styles.th, CHECKLIST_COLS.drawing]}>Drawing No.</Text>
              <Text style={[styles.th, CHECKLIST_COLS.items]}>Items</Text>
              <Text style={[styles.th, CHECKLIST_COLS.signedBy]}>Signed By</Text>
              <Text style={[styles.th, CHECKLIST_COLS.signedDate]}>Date</Text>
            </View>
            {data.checklists.signed.length === 0 ? (
              <EmptyTableRow message="No checklists signed this period." />
            ) : (
              data.checklists.signed.map((c, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, CHECKLIST_COLS.ref]}>{c.docRefNo}</Text>
                  <Text style={[styles.td, CHECKLIST_COLS.title]}>{c.title}</Text>
                  <Text style={[styles.td, CHECKLIST_COLS.drawing]}>{c.referenceDrawingNo}</Text>
                  <Text style={[styles.td, CHECKLIST_COLS.items]}>{c.itemCount}</Text>
                  <Text style={[styles.td, CHECKLIST_COLS.signedBy]}>{c.signedByName}</Text>
                  <Text style={[styles.td, CHECKLIST_COLS.signedDate]}>{c.signedDateFormatted}</Text>
                </View>
              ))
            )}
          </View>
          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>All checklists on this project</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, CHECKLIST_ROSTER_COLS.ref]}>Ref No.</Text>
              <Text style={[styles.th, CHECKLIST_ROSTER_COLS.title]}>Title</Text>
              <Text style={[styles.th, CHECKLIST_ROSTER_COLS.status]}>Status</Text>
              <Text style={[styles.th, CHECKLIST_ROSTER_COLS.filled]}>Filled / Items</Text>
            </View>
            {data.checklists.allChecklists.length === 0 ? (
              <EmptyTableRow message="No checklists on this project." />
            ) : (
              data.checklists.allChecklists.map((c, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, CHECKLIST_ROSTER_COLS.ref]}>{c.docRefNo}</Text>
                  <Text style={[styles.td, CHECKLIST_ROSTER_COLS.title]}>{c.title}</Text>
                  <Text style={[styles.td, CHECKLIST_ROSTER_COLS.status]}>{c.statusLabel}</Text>
                  <Text style={[styles.td, CHECKLIST_ROSTER_COLS.filled]}>{c.filledCount} / {c.itemCount}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>6.2 Non-Conformances — Not O.K. check points, this period</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, { width: '12%' }]}>Ref No.</Text>
              <Text style={[styles.th, { width: '22%' }]}>Checklist</Text>
              <Text style={[styles.th, { width: '33%' }]}>Check Point</Text>
              <Text style={[styles.th, { width: '33%' }]}>Remarks</Text>
            </View>
            {data.nonConformances.length === 0 ? (
              <EmptyTableRow message="No non-conformances recorded this period." />
            ) : (
              data.nonConformances.map((n, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, { width: '12%' }]}>{n.docRefNo}</Text>
                  <Text style={[styles.td, { width: '22%' }]}>{n.checklistTitle}</Text>
                  <Text style={[styles.td, { width: '33%' }]}>{n.description}</Text>
                  <Text style={[styles.td, { width: '33%' }]}>{n.remarks}</Text>
                </View>
              ))
            )}
          </View>
        </Section>

        <Section title="7. Key Issues &amp; Risks">
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, { width: '45%' }]}>Issue</Text>
              <Text style={[styles.th, { width: '15%' }]}>Severity</Text>
              <Text style={[styles.th, { width: '40%' }]}>Detail</Text>
            </View>
            {data.keyRisks.length === 0 ? (
              <EmptyTableRow message="No overdue activities or bills flagged this period." />
            ) : (
              data.keyRisks.map((r, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, { width: '45%' }]}>{r.description}</Text>
                  <Text style={[styles.td, { width: '15%', color: r.severity === 'Critical' ? '#e06050' : r.severity === 'Major' ? '#b3943f' : undefined }]}>{r.severity}</Text>
                  <Text style={[styles.td, { width: '40%' }]}>{r.detail}</Text>
                </View>
              ))
            )}
          </View>
        </Section>

        <Section title="8. Progress Photographs">
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>Site photos captured via activity progress updates and Daily Progress Reports this period.</Text>
          {data.evidencePhotos.length === 0 ? (
            <Text style={[styles.td, { color: '#6b7280' }]}>No photos captured this period.</Text>
          ) : (
            data.evidencePhotos.map((group, i) => <EvidencePhotoBlock key={i} group={group} />)
          )}
        </Section>

        <Section title="9. Annexures — Drawings &amp; Documents">
          <Text style={[styles.td, { marginBottom: 4, color: '#6b7280' }]}>
            9.1 Drawings (this period) — listed for visibility only; Architecture drawings are PDF/URL uploads, not raster images, so there's no thumbnail to embed here the way photos are above.
          </Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, DRAWING_COLS.serial]}>No.</Text>
              <Text style={[styles.th, DRAWING_COLS.name]}>Name</Text>
              <Text style={[styles.th, DRAWING_COLS.category]}>Category</Text>
              <Text style={[styles.th, DRAWING_COLS.status]}>Status</Text>
              <Text style={[styles.th, DRAWING_COLS.uploadedBy]}>Uploaded By</Text>
              <Text style={[styles.th, DRAWING_COLS.date]}>Date</Text>
            </View>
            {data.drawings.length === 0 ? (
              <EmptyTableRow message="No drawings uploaded or reviewed this period." />
            ) : (
              data.drawings.map((d, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, DRAWING_COLS.serial]}>{d.serialNo}</Text>
                  <Text style={[styles.td, DRAWING_COLS.name]}>{d.name}</Text>
                  <Text style={[styles.td, DRAWING_COLS.category]}>{d.category}</Text>
                  <Text style={[styles.td, DRAWING_COLS.status]}>{d.statusLabel}</Text>
                  <Text style={[styles.td, DRAWING_COLS.uploadedBy]}>{d.uploadedByName}</Text>
                  <Text style={[styles.td, DRAWING_COLS.date]}>{d.dateFormatted}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={[styles.td, { marginTop: 8, marginBottom: 4, color: '#6b7280' }]}>9.2 Documents</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, DOC_COLS.title]}>Title</Text>
              <Text style={[styles.th, DOC_COLS.category]}>Category</Text>
              <Text style={[styles.th, DOC_COLS.uploadedBy]}>Uploaded By</Text>
              <Text style={[styles.th, DOC_COLS.date]}>Date</Text>
            </View>
            {data.documents.uploaded.length === 0 ? (
              <EmptyTableRow message="No documents uploaded this period." />
            ) : (
              data.documents.uploaded.map((d, i) => (
                <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                  <Text style={[styles.td, DOC_COLS.title]}>{d.title}</Text>
                  <Text style={[styles.td, DOC_COLS.category]}>{d.category === 'SPEC' ? 'Spec' : 'Other'}</Text>
                  <Text style={[styles.td, DOC_COLS.uploadedBy]}>{d.uploadedByName}</Text>
                  <Text style={[styles.td, DOC_COLS.date]}>{d.dateFormatted}</Text>
                </View>
              ))
            )}
          </View>
        </Section>

        <PdfFooter logoDataUri={data.logoDataUri} qrDataUri={data.qrDataUri} generatedAtFormatted={data.generatedAtFormatted} />
      </Page>
    </Document>
  );
}
