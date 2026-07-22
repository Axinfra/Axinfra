import { StyleSheet } from '@react-pdf/renderer';

// Shared AxInfra brand palette + layout primitives for every generated PDF (Work Order, RA
// Bill, ...) so documents read as one consistent system regardless of which one you open.
export const GOLD = '#b3943f';
export const GOLD_TINT = '#f5eeda';
export const INK = '#1b1e24';
export const MUTED = '#6b7280';
export const BORDER = '#e2e0da';
export const PANEL = '#faf9f6';

export const sharedPdfStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 36,
    paddingBottom: 70,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: INK,
    backgroundColor: '#ffffff',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
    paddingBottom: 10,
    marginBottom: 12,
  },
  logo: { width: 130, height: 39 },
  companyName: { fontSize: 8, color: MUTED, marginTop: 3, letterSpacing: 0.5 },
  titleBlock: { alignItems: 'flex-end' },
  title: { fontSize: 19, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 1 },
  titleSub: { fontSize: 8, color: MUTED, marginTop: 2 },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  metaItem: { width: '33.33%', marginBottom: 8, paddingRight: 8 },
  metaLabel: { fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.75, marginBottom: 2 },
  metaValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK },

  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: GOLD,
    paddingBottom: 4,
  },

  panel: { backgroundColor: PANEL, borderWidth: 1, borderColor: BORDER, borderRadius: 3, padding: 10 },
  panelGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  panelItem: { width: '50%', marginBottom: 7, paddingRight: 8 },
  panelItemFull: { width: '100%', marginBottom: 0, paddingRight: 8 },
  panelLabel: { fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  panelValue: { fontSize: 9, color: INK },

  labeledBlock: { marginBottom: 8 },
  labeledBlockLabel: { fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  labeledBlockValue: { fontSize: 9, color: INK, lineHeight: 1.4 },

  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 3, overflow: 'hidden' },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: GOLD_TINT,
    borderBottomWidth: 1,
    borderBottomColor: GOLD,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRowAlt: { backgroundColor: '#fdfcfa' },
  th: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: INK, textTransform: 'uppercase', letterSpacing: 0.2 },
  td: { fontSize: 8, color: INK },

  // A tinted full-width sub-header row nested inside a table — used by the DPR manpower table
  // to group trade rows under a vendor name (e.g. "Vanbros — Civil+Interior").
  groupHeaderRow: {
    flexDirection: 'row',
    backgroundColor: PANEL,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  groupHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: INK },

  totalsBlock: { marginTop: 8, alignItems: 'flex-end' },
  totalsRow: { flexDirection: 'row', width: 220, justifyContent: 'space-between', paddingVertical: 3 },
  totalsLabel: { fontSize: 8.5, color: MUTED },
  totalsValue: { fontSize: 8.5, color: INK },
  grandTotalRow: {
    flexDirection: 'row',
    width: 220,
    justifyContent: 'space-between',
    backgroundColor: GOLD_TINT,
    borderTopWidth: 1,
    borderTopColor: GOLD,
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginTop: 2,
  },
  grandTotalLabel: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK },
  grandTotalValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK },

  sigGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  sigBox: {
    width: '48%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    padding: 10,
    marginRight: '2%',
    marginBottom: 10,
    minHeight: 92,
  },
  sigTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 },
  sigLine: { borderBottomWidth: 0.75, borderBottomColor: MUTED, marginBottom: 4, height: 16 },
  sigCaption: { fontSize: 6.5, color: MUTED, marginBottom: 6 },
  sigDetailRow: { flexDirection: 'row', marginBottom: 2 },
  sigDetailLabel: { fontSize: 7, color: MUTED, width: 60 },
  sigDetailValue: { fontSize: 7.5, color: INK, flex: 1, borderBottomWidth: 0.5, borderBottomColor: BORDER },

  footer: {
    position: 'absolute',
    bottom: 22,
    left: 36,
    right: 36,
    borderTopWidth: 0.75,
    borderTopColor: BORDER,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLogo: { width: 54, height: 16 },
  footerTextBlock: { flex: 1, marginLeft: 10 },
  footerText: { fontSize: 6.5, color: MUTED },
  footerQr: { width: 34, height: 34 },
});
