'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { X, Wallet, FileSpreadsheet, Download } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency } from '@/lib/utils';
import { cardShadow, iconBadge } from './vendorTheme';
import VendorActionButton from './VendorActionButton';

interface BOQOption {
  id: string;
  name: string | null;
  status: string;
  items: Array<{ description: string; unit: string; rate: number; plannedQty: number }>;
}

const DESC_HEADER = /description|item|particular|work/i;
const QTY_HEADER = /this\s*(period|bill)|executed|completed|qty|quantity|nos\b/i;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Finds the BOQ item whose description best matches a free-text row from an imported sheet —
 * exact match first (works for our own downloaded template, unchanged), then substring match
 * either direction (works for a vendor's own bill using their own wording). Returns null if
 * nothing is a plausible match, rather than guessing wrong. */
function matchBoq(description: string, boqs: BOQOption[]): BOQOption | null {
  const target = normalize(description);
  if (!target) return null;
  const exact = boqs.find((b) => normalize(b.items[0]?.description ?? '') === target);
  if (exact) return exact;
  const partial = boqs.find((b) => {
    const d = normalize(b.items[0]?.description ?? '');
    return d.length > 0 && (target.includes(d) || d.includes(target));
  });
  return partial ?? null;
}

/** Vendor drafts a new RA Bill: pick a period, then enter how much of each approved item they
 * executed this period. Mirrors real running-account billing — the contractor claims the
 * quantity, PMC/Consultant measures and certifies it afterwards. Quantities can be typed in
 * directly, or bulk-loaded from an Excel sheet (our own downloadable template, or the vendor's
 * own bill in roughly the same shape) — either way the same fields stay open for editing
 * before the bill is created. */
export default function VendorCreateRABillModal({
  projectId,
  orderId,
  onClose,
}: {
  projectId: string;
  orderId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: boqsPayload } = useSWR<{ boqs: BOQOption[] }>(
    `/api/projects/${projectId}/orders/${orderId}/boqs`,
    jsonFetcher,
  );
  // The BOQ list API already restricts a vendor to APPROVED items only (see
  // RoleGuard.visibleBOQStatuses) — no client-side status filter needed here.
  const approvedBoqs = boqsPayload?.boqs ?? [];

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [qtyByBoq, setQtyByBoq] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');
  const [unmatchedRows, setUnmatchedRows] = useState<string[]>([]);

  const total = approvedBoqs.reduce((sum, b) => {
    const item = b.items[0];
    const qty = parseFloat(qtyByBoq[b.id] || '0') || 0;
    return sum + qty * (item?.rate ?? 0);
  }, 0);

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const rows = [
      ['Description', 'Unit', 'Rate', 'Contracted Qty', 'This Period Qty'],
      ...approvedBoqs.map((b) => {
        const item = b.items[0];
        return [item?.description ?? b.name ?? '', item?.unit ?? '', item?.rate ?? 0, item?.plannedQty ?? '', ''];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 50 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RA Bill');
    XLSX.writeFile(wb, 'ra-bill-template.xlsx');
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setError('');
    setImportNote('');
    setUnmatchedRows([]);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', blankrows: false });

      // Find the header row and which columns hold the description and this-period quantity —
      // works for our own template's exact headers and for a differently-worded sheet, as long
      // as it has some column that reads as "description" and one that reads as a quantity.
      let headerRowIdx = -1, descCol = -1, qtyCol = -1;
      for (let i = 0; i < Math.min(raw.length, 10); i++) {
        const row = raw[i].map((c) => String(c ?? ''));
        const d = row.findIndex((c) => DESC_HEADER.test(c));
        const q = row.map((c, idx) => ({ c, idx })).filter(({ c }) => QTY_HEADER.test(c)).map(({ idx }) => idx).pop() ?? -1;
        if (d !== -1 && q !== -1) { headerRowIdx = i; descCol = d; qtyCol = q; break; }
      }
      if (headerRowIdx === -1) {
        setError('Could not find a description/quantity column. Use the downloaded template as a guide.');
        return;
      }

      const nextQtyByBoq: Record<string, string> = {};
      const unmatched: string[] = [];
      let matchedCount = 0;

      for (let i = headerRowIdx + 1; i < raw.length; i++) {
        const row = raw[i];
        const description = String(row[descCol] ?? '').trim();
        const qty = parseFloat(String(row[qtyCol] ?? ''));
        if (!description || !Number.isFinite(qty) || qty <= 0) continue;
        const boq = matchBoq(description, approvedBoqs);
        if (boq) {
          nextQtyByBoq[boq.id] = String(qty);
          matchedCount++;
        } else {
          unmatched.push(description);
        }
      }

      if (matchedCount === 0) {
        setError('No rows matched an approved item on this order. Use the downloaded template as a guide.');
        return;
      }

      setQtyByBoq((prev) => ({ ...prev, ...nextQtyByBoq }));
      setImportNote(`${matchedCount} item${matchedCount === 1 ? '' : 's'} loaded from the file — review before creating.`);
      setUnmatchedRows(unmatched);
    } catch {
      setError('Could not read that file. Use the downloaded template as a guide.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreate = async () => {
    const lineItems = Object.entries(qtyByBoq)
      .filter(([, qty]) => qty && parseFloat(qty) > 0)
      .map(([boqId, qty]) => ({ boqId, thisBillQty: parseFloat(qty) }));

    if (!periodStart || !periodEnd) {
      setError('Pick a start and end date');
      return;
    }
    if (lineItems.length === 0) {
      setError('Enter how much you completed for at least one item');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodStart, periodEnd, lineItems }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/projects/${projectId}/orders/${orderId}/ra-bills/${data.data.raBillId}`);
      } else {
        setError(data.error ?? 'Could not create. Try again.');
      }
    } catch {
      setError('Could not create. Try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
        }}
      />
      <div className="w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] flex flex-col max-h-[90vh]" style={{ background: 'var(--ax-base)', ...cardShadow }}>
        <div className="flex items-center gap-3 p-5 shrink-0">
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={iconBadge('#22c55e')}>
            <Wallet className="w-5 h-5" style={{ color: '#22c55e' }} strokeWidth={2.25} />
          </div>
          <h2 className="text-xl font-bold flex-1" style={{ color: 'var(--ax-text)' }}>New Bill</h2>
          <button onClick={onClose} aria-label="Close" className="flex items-center justify-center w-11 h-11 rounded-full shrink-0" style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}>
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {approvedBoqs.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => void handleDownloadTemplate()}
                className="flex items-center justify-center gap-2 rounded-2xl py-3 font-bold text-sm"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}
              >
                <Download className="w-4 h-4" strokeWidth={2.5} /> Template
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="flex items-center justify-center gap-2 rounded-2xl py-3 font-bold text-sm disabled:opacity-50"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-accent)' }}
              >
                <FileSpreadsheet className="w-4 h-4" strokeWidth={2.5} /> {importing ? 'Reading…' : 'Import Excel'}
              </button>
            </div>
          )}

          {importNote && (
            <p className="text-sm font-semibold rounded-2xl px-4 py-3" style={{ color: '#22c55e', background: 'rgba(34,197,94,0.1)' }}>{importNote}</p>
          )}
          {unmatchedRows.length > 0 && (
            <div className="text-sm rounded-2xl px-4 py-3" style={{ color: '#eab308', background: 'rgba(234,179,8,0.1)' }}>
              <p className="font-semibold">{unmatchedRows.length} row{unmatchedRows.length === 1 ? '' : 's'} didn&apos;t match an approved item — enter these manually:</p>
              <ul className="mt-1 list-disc list-inside space-y-0.5 opacity-80">
                {unmatchedRows.slice(0, 5).map((d, i) => <li key={i}>{d}</li>)}
                {unmatchedRows.length > 5 && <li>+{unmatchedRows.length - 5} more</li>}
              </ul>
            </div>
          )}
          {error && (
            <p className="text-base font-semibold rounded-2xl px-4 py-3" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>{error}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold uppercase tracking-wide block mb-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>From</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-2xl p-3.5 text-base font-semibold"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}
              />
            </div>
            <div>
              <label className="text-sm font-bold uppercase tracking-wide block mb-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>To</label>
              <input
                type="date"
                value={periodEnd}
                min={periodStart || undefined}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-2xl p-3.5 text-base font-semibold"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>How Much You Completed</p>
            {approvedBoqs.length === 0 ? (
              <p className="text-base text-center py-6" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>No approved items on this order yet</p>
            ) : (
              <div className="space-y-2.5">
                {approvedBoqs.map((b) => {
                  const item = b.items[0];
                  const qty = parseFloat(qtyByBoq[b.id] || '0') || 0;
                  const amount = qty * (item?.rate ?? 0);
                  return (
                    <div key={b.id} className="rounded-2xl p-4 space-y-2.5" style={{ background: 'var(--ax-card)' }}>
                      <p className="font-semibold text-base" style={{ color: 'var(--ax-text)' }}>{item?.description || b.name || 'Untitled'}</p>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          placeholder={`Qty (${item?.unit ?? ''})`}
                          value={qtyByBoq[b.id] ?? ''}
                          onChange={(e) => setQtyByBoq({ ...qtyByBoq, [b.id]: e.target.value })}
                          className="flex-1 rounded-xl p-3 text-base font-bold text-right"
                          style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)' }}
                        />
                        <span className="font-bold text-base w-28 text-right shrink-0" style={{ color: 'var(--ax-accent)' }}>{formatCurrency(amount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="font-bold text-lg" style={{ color: 'var(--ax-text)' }}>Total</span>
              <span className="font-bold text-2xl" style={{ color: 'var(--ax-accent)' }}>{formatCurrency(total)}</span>
            </div>
          )}

          <VendorActionButton
            label="Create"
            loadingLabel="Creating…"
            loading={creating}
            onClick={() => void handleCreate()}
            variant="primary"
          />
        </div>
      </div>
    </div>
  );
}
