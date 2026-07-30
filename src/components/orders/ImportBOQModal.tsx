'use client';

import { useRef, useState, useEffect, useMemo } from 'react';

interface ImportRow {
  orderName: string;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
}

interface ImportResult {
  created: number;
  skipped: number;
  duplicates: number;
  results: Array<{ orderName: string; itemsAdded?: number; duplicatesSkipped?: number; error?: string; orderCreated?: boolean }>;
}

interface OrderOption {
  id: string;
  name: string;
}

/** Bulk-import a BOQ spreadsheet — one sheet can seed multiple Purchase Orders (matched by
 * name, or created new) each with their own BOQ and line items in one go. Lifted from the
 * former single-BOQ-per-order BOQ page; behavior unchanged, just relocated here since Purchase
 * Orders can now hold multiple BOQs and no longer have one canonical "the BOQ page". */
export default function ImportBOQModal({
  projectId,
  orders,
  onClose,
  onImported,
}: {
  projectId: string;
  orders: OrderOption[];
  onClose: () => void;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importParseNote, setImportParseNote] = useState('');
  const [importParseError, setImportParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [includedOrders, setIncludedOrders] = useState<Set<string>>(new Set());

  const importGroups = useMemo(() => {
    const byOrder = new Map<string, ImportRow[]>();
    for (const row of importRows) {
      const list = byOrder.get(row.orderName) ?? [];
      list.push(row);
      byOrder.set(row.orderName, list);
    }
    return Array.from(byOrder.entries()).map(([name, rows]) => ({
      name,
      rows,
      matched: orders.find((o) => o.name.toLowerCase().trim() === name.toLowerCase().trim()) ?? null,
      total: rows.reduce((s, r) => s + r.plannedQty * r.rate, 0),
    }));
  }, [importRows, orders]);

  useEffect(() => {
    if (importRows.length === 0) return;
    setIncludedOrders(new Set(importGroups.filter((g) => g.matched).map((g) => g.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importRows]);

  const toggleOrderIncluded = (name: string) => {
    setIncludedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleImportFile = async (file: File) => {
    setImportParseError('');
    setImportParseNote('');
    setImportRows([]);
    setImportResult(null);
    setIncludedOrders(new Set());
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(ws, {
        header: 1,
        defval: '',
        blankrows: false,
      }) as (string | number)[][];

      const rows: ImportRow[] = [];
      const skippedLines: number[] = [];
      let lastOrderName = '';

      for (let i = 1; i < raw.length; i++) {
        const r = raw[i];
        const rawOrderName = String(r[0] ?? '').trim();
        const description = String(r[1] ?? '').trim();
        const unit = String(r[2] ?? '').trim();
        const qty = parseFloat(String(r[3] ?? ''));
        const rate = parseFloat(String(r[4] ?? ''));
        if (!rawOrderName && !description) continue;
        const orderName = rawOrderName || lastOrderName;
        if (rawOrderName) lastOrderName = rawOrderName;
        if (!orderName || !description || !unit || isNaN(qty) || isNaN(rate) || qty <= 0 || rate <= 0) {
          skippedLines.push(i + 1);
          continue;
        }
        rows.push({ orderName, description, unit, plannedQty: qty, rate });
      }

      if (rows.length === 0) {
        setImportParseError(
          `No valid rows found${skippedLines.length ? ` — ${skippedLines.length} rows had missing/invalid data` : ''}. Check the file matches the template.`
        );
        return;
      }
      if (skippedLines.length > 0) {
        setImportParseNote(
          `${rows.length} items loaded. ${skippedLines.length} rows skipped (rows ${skippedLines.slice(0, 5).join(', ')}${skippedLines.length > 5 ? '…' : ''}).`
        );
      }
      setImportRows(rows);
    } catch {
      setImportParseError("Could not read the file. Use the provided .xlsx template.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    const selectedRows = importRows.filter((r) => includedOrders.has(r.orderName));
    if (!selectedRows.length) return;
    setImporting(true);
    setImportParseError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selectedRows }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(data.data as ImportResult);
        onImported();
      } else {
        setImportParseError(data.error ?? 'Import failed');
      }
    } catch {
      setImportParseError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
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
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl w-full max-w-2xl">
        <div className="p-6 space-y-5">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-[#e8e4dc]">Import Order from Excel</h2>
            <button onClick={onClose} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] text-xl leading-none">✕</button>
          </div>

          {importResult ? (
            (() => {
              const allDuplicates = importResult.created === 0 && importResult.skipped === 0 && importResult.duplicates > 0;
              const tone = importResult.created > 0 ? 'success' : allDuplicates ? 'neutral' : 'error';
              const toneClasses = {
                success: { box: 'bg-[rgba(92,186,128,0.07)] border-[rgba(92,186,128,0.2)]', text: 'text-[#5cba80]' },
                neutral: { box: 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)]', text: 'text-[rgba(232,228,220,0.65)]' },
                error: { box: 'bg-[rgba(224,96,80,0.07)] border-[rgba(224,96,80,0.2)]', text: 'text-[#e06050]' },
              }[tone];
              return (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg border ${toneClasses.box}`}>
                    <p className={`font-medium text-sm ${toneClasses.text}`}>
                      {importResult.created > 0
                        ? `✓ ${importResult.created} items imported successfully`
                        : allDuplicates
                        ? 'No new items — everything in this sheet was already in the Order'
                        : 'No items were imported'}
                      {importResult.skipped > 0 && ` · ${importResult.skipped} skipped`}
                      {importResult.duplicates > 0 && !allDuplicates && ` · ${importResult.duplicates} duplicate${importResult.duplicates > 1 ? 's' : ''} left as-is`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {importResult.results.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-[rgba(255,255,255,0.05)] last:border-0">
                        <span className="text-[#e8e4dc] font-medium flex items-center gap-2">
                          {r.orderName}
                          {r.orderCreated && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.15)] text-[var(--ax-accent)]">New Purchase Order</span>
                          )}
                        </span>
                        {r.error ? (
                          <span className="text-[#e06050] text-xs">{r.error}</span>
                        ) : (
                          <span className="text-[#5cba80] text-xs">
                            {r.itemsAdded} items added
                            {!!r.duplicatesSkipped && (
                              <span className="text-[rgba(232,228,220,0.4)]"> · {r.duplicatesSkipped} duplicate{r.duplicatesSkipped > 1 ? 's' : ''} skipped</span>
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={onClose} className="btn btn-secondary">Close</button>
                    <button onClick={() => { setImportRows([]); setImportResult(null); setImportParseNote(''); setImportParseError(''); setIncludedOrders(new Set()); }} className="btn btn-primary">Import More</button>
                  </div>
                </div>
              );
            })()
          ) : importRows.length > 0 ? (
            (() => {
              const groups = importGroups;
              const unmatchedCount = groups.filter((g) => !g.matched).length;
              const selectedGroups = groups.filter((g) => includedOrders.has(g.name));
              const selectedItemCount = selectedGroups.reduce((s, g) => s + g.rows.length, 0);
              const allChecked = groups.length > 0 && groups.every((g) => includedOrders.has(g.name));
              const toggleAll = () => setIncludedOrders(allChecked ? new Set() : new Set(groups.map((g) => g.name)));
              return (
                <div className="space-y-4">
                  {importParseNote && (
                    <p className="text-xs text-[rgba(249,115,22,0.8)] bg-[rgba(249,115,22,0.07)] border border-[rgba(249,115,22,0.2)] rounded-lg px-3 py-2">{importParseNote}</p>
                  )}
                  <p className="text-sm text-[rgba(232,228,220,0.55)]">
                    <span className="text-[#e8e4dc] font-medium">{importRows.length} items</span> across <span className="text-[#e8e4dc] font-medium">{groups.length} purchase orders</span>
                    {' — '}
                    <span className="text-[var(--ax-accent)] font-medium">{selectedItemCount} items in {selectedGroups.length} purchase order{selectedGroups.length === 1 ? '' : 's'}</span> selected
                  </p>
                  <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)]">
                          <th className="text-center px-3 py-2.5 w-10">
                            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 accent-[var(--ax-accent)] cursor-pointer" aria-label="Include all purchase orders" />
                          </th>
                          <th className="text-left px-4 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Purchase Order (from Excel)</th>
                          <th className="text-center px-3 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Status</th>
                          <th className="text-right px-3 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Items</th>
                          <th className="text-right px-4 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g, i) => {
                          const included = includedOrders.has(g.name);
                          return (
                            <tr key={i} className={`border-b border-[rgba(255,255,255,0.04)] last:border-0 ${included ? '' : 'opacity-45'}`}>
                              <td className="px-3 py-2.5 text-center">
                                <input type="checkbox" checked={included} onChange={() => toggleOrderIncluded(g.name)} className="w-4 h-4 accent-[var(--ax-accent)] cursor-pointer" aria-label={`Include ${g.name}`} />
                              </td>
                              <td className="px-4 py-2.5 text-[#e8e4dc]">{g.name}</td>
                              <td className="px-3 py-2.5 text-center">
                                {g.matched ? (
                                  <span className="text-xs text-[#5cba80]">✓ Matched</span>
                                ) : included ? (
                                  <span className="text-xs text-[var(--ax-accent)]">+ New purchase order</span>
                                ) : (
                                  <span className="text-xs text-[rgba(232,228,220,0.4)]">Not found — excluded</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right text-[rgba(232,228,220,0.65)]">{g.rows.length}</td>
                              <td className="px-4 py-2.5 text-right text-[var(--ax-accent)] font-medium">₹{g.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                  {unmatchedCount > 0 && (
                    <p className="text-xs text-[rgba(232,228,220,0.45)] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2">
                      {unmatchedCount} purchase order{unmatchedCount > 1 ? 's' : ''} not found in this project. Check the box to create {unmatchedCount > 1 ? 'them' : 'it'} automatically along with the Order — leave unchecked to skip.
                    </p>
                  )}
                  {importParseError && <p className="text-xs text-[#e06050]">{importParseError}</p>}
                  <div className="flex justify-end gap-3 pt-1">
                    <button onClick={() => setImportRows([])} className="btn btn-secondary">← Re-upload</button>
                    <button onClick={() => void handleImport()} disabled={importing || selectedGroups.length === 0} className="btn btn-primary disabled:opacity-50">
                      {importing ? 'Importing…' : `Import ${selectedItemCount} Items`}
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-medium text-[rgba(232,228,220,0.45)] uppercase tracking-wider mb-2">Required Columns (in order)</p>
                <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)]">
                        {['Purchase Order', 'Description', 'Unit', 'Quantity', 'Rate (₹)'].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-xs text-[rgba(232,228,220,0.55)] font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-[rgba(232,228,220,0.65)]">
                      <tr className="border-b border-[rgba(255,255,255,0.04)]">
                        <td className="px-3 py-2 text-[var(--ax-accent)]">Foundation</td>
                        <td className="px-3 py-2">Excavation for columns</td>
                        <td className="px-3 py-2">cum</td>
                        <td className="px-3 py-2">50</td>
                        <td className="px-3 py-2">850</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-[var(--ax-accent)]">Structure</td>
                        <td className="px-3 py-2">RCC M25 columns</td>
                        <td className="px-3 py-2">cum</td>
                        <td className="px-3 py-2">18</td>
                        <td className="px-3 py-2">8500</td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
              <a href={`/api/projects/${projectId}/boq/template`} download className="flex items-center gap-2 text-sm text-[var(--ax-accent)] hover:underline">
                <span>↓</span>
                <span>Download template with your project&apos;s purchase order names pre-filled</span>
              </a>
              <div>
                <p className="text-xs font-medium text-[rgba(232,228,220,0.45)] uppercase tracking-wider mb-2">Upload File</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-[rgba(255,255,255,0.1)] rounded-xl py-8 px-4 text-center hover:border-[rgba(var(--ax-accent-rgb),0.4)] hover:bg-[rgba(var(--ax-accent-rgb),0.03)] transition-all group"
                >
                  <p className="text-[rgba(232,228,220,0.55)] group-hover:text-[rgba(232,228,220,0.8)] text-sm">Click to browse or drop your .xlsx file here</p>
                  <p className="text-xs text-[rgba(232,228,220,0.3)] mt-1">Supports .xlsx · .xls · .csv</p>
                </button>
              </div>
              {importParseError && (
                <p className="text-sm text-[#e06050] bg-[rgba(224,96,80,0.07)] border border-[rgba(224,96,80,0.2)] rounded-lg px-3 py-2">{importParseError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
