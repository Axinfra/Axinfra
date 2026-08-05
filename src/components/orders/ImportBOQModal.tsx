'use client';

import { useRef, useState, useEffect, useMemo } from 'react';

interface ImportRow {
  orderName: string;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
  /** Set only for AI-extracted rows (PDF/photo) — shown as a small badge in the preview so
   * it's clear which rows came from a document read by AI vs. a structured Excel sheet. */
  sourceFile?: string;
}

interface AiExtractFileResult {
  fileName: string;
  orderName?: string;
  itemsExtracted?: number;
  error?: string;
}

const AI_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const AI_FILE_EXTENSIONS = /\.(pdf|jpe?g|png|gif|webp)$/i;

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
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiFileResults, setAiFileResults] = useState<AiExtractFileResult[]>([]);

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

  /** Parses one Excel/CSV file client-side — fast, free, no AI involved. Returns null (and sets
   * the parse error) if nothing usable was found. */
  const parseExcelFile = async (file: File): Promise<{ rows: ImportRow[]; skippedCount: number } | null> => {
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
    let skippedCount = 0;
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
        skippedCount++;
        continue;
      }
      rows.push({ orderName, description, unit, plannedQty: qty, rate });
    }

    return rows.length > 0 ? { rows, skippedCount } : null;
  };

  /** Sends every PDF/image in the batch to the AI extraction endpoint in one request — reads
   * typed, scanned, or handwritten Purchase Orders/BOQs (one Claude call per file server-side,
   * so one unreadable file doesn't sink the rest of the batch). */
  const extractAiFiles = async (files: File[]): Promise<{ rows: ImportRow[]; fileResults: AiExtractFileResult[] } | null> => {
    const body = new FormData();
    for (const f of files) body.append('files', f);
    const res = await fetch(`/api/projects/${projectId}/boq/import/ai-extract`, { method: 'POST', body });
    const data = await res.json();
    if (!data.success) {
      setImportParseError(data.error ?? 'AI document reading failed');
      return null;
    }
    const rows: ImportRow[] = data.data.items.map((it: { orderName: string; description: string; unit: string; plannedQty: number; rate: number; sourceFile: string }) => ({
      orderName: it.orderName,
      description: it.description,
      unit: it.unit,
      plannedQty: it.plannedQty,
      rate: it.rate,
      sourceFile: it.sourceFile,
    }));
    return { rows, fileResults: data.data.fileResults as AiExtractFileResult[] };
  };

  /** Entry point for the file picker — splits the selected files into Excel (tried instantly,
   * client-side, against the standard template) and PDF/image (always sent to the server for AI
   * extraction). Any Excel file that doesn't match the standard 5-column template — a vendor's
   * own SKU sheet, different column names, no order-name column, no unit column, whatever shape
   * — falls back to the same server-side AI extraction instead of just failing, so only
   * well-formed template sheets skip the AI call entirely. */
  const handleImportFiles = async (files: File[]) => {
    setImportParseError('');
    setImportParseNote('');
    setImportRows([]);
    setImportResult(null);
    setIncludedOrders(new Set());
    setAiFileResults([]);

    const excelFiles = files.filter((f) => !AI_FILE_TYPES.has(f.type) && !AI_FILE_EXTENSIONS.test(f.name));
    const aiFiles = files.filter((f) => AI_FILE_TYPES.has(f.type) || AI_FILE_EXTENSIONS.test(f.name));

    const allRows: ImportRow[] = [];
    const aiFallbackFiles: File[] = [];
    let skippedTotal = 0;

    try {
      for (const file of excelFiles) {
        try {
          const parsed = await parseExcelFile(file);
          if (parsed) {
            allRows.push(...parsed.rows);
            skippedTotal += parsed.skippedCount;
          } else {
            aiFallbackFiles.push(file);
          }
        } catch {
          aiFallbackFiles.push(file);
        }
      }

      const allAiFiles = [...aiFiles, ...aiFallbackFiles];
      if (allAiFiles.length > 0) {
        setAiExtracting(true);
        const aiResult = await extractAiFiles(allAiFiles);
        setAiExtracting(false);
        if (aiResult) {
          allRows.push(...aiResult.rows);
          setAiFileResults(aiResult.fileResults);
        }
      }

      if (allRows.length === 0) {
        setImportParseError((prev) => prev || 'No valid line items found. Check the file(s) match the template, or are readable documents.');
        return;
      }
      if (skippedTotal > 0) {
        setImportParseNote(`${skippedTotal} spreadsheet row${skippedTotal > 1 ? 's' : ''} skipped (missing/invalid data)`);
      }
      setImportRows(allRows);
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
        accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.gif,.webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void handleImportFiles(files);
        }}
      />
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl w-full max-w-2xl">
        <div className="p-6 space-y-5">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-[#e8e4dc]">Import Order</h2>
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
              const matchedCount = groups.filter((g) => g.matched).length;
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
                          <th className="text-left px-4 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Purchase Order</th>
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
                              <td className="px-4 py-2.5 text-[#e8e4dc]">
                                {g.name}
                                {g.rows.some((r) => r.sourceFile) && (
                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.15)] text-[var(--ax-accent)] align-middle">AI read</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {g.matched ? (
                                  <span className="text-xs text-[#e09840]" title="This Purchase Order already exists — these items will be added into it, not create a new one">⚠ Already exists</span>
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
                  {matchedCount > 0 && (
                    <p className="text-xs text-[#e09840] bg-[rgba(224,152,64,0.07)] border border-[rgba(224,152,64,0.22)] rounded-lg px-3 py-2">
                      ⚠ {matchedCount} purchase order{matchedCount > 1 ? 's' : ''} already exist{matchedCount > 1 ? '' : 's'} in this project — matching items will be added into {matchedCount > 1 ? 'them' : 'it'}, not create a duplicate. Any item whose description already exists on that Order's BOQ is skipped automatically.
                    </p>
                  )}
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
                <p className="text-xs font-medium text-[rgba(232,228,220,0.45)] uppercase tracking-wider mb-2">Upload File(s)</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={aiExtracting}
                  className="w-full border-2 border-dashed border-[rgba(255,255,255,0.1)] rounded-xl py-8 px-4 text-center hover:border-[rgba(var(--ax-accent-rgb),0.4)] hover:bg-[rgba(var(--ax-accent-rgb),0.03)] transition-all group disabled:opacity-60"
                >
                  {aiExtracting ? (
                    <div>
                      <p className="text-[var(--ax-accent)] text-sm">Reading documents with AI…</p>
                      <p className="text-xs text-[rgba(232,228,220,0.3)] mt-1">A large, multi-page document can take a couple of minutes — keep this open</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[rgba(232,228,220,0.55)] group-hover:text-[rgba(232,228,220,0.8)] text-sm">Click to browse or drop files here — you can select several at once</p>
                      <p className="text-xs text-[rgba(232,228,220,0.3)] mt-1">.xlsx · .xls · .csv (any column layout — a non-matching sheet is read automatically with AI), or a PDF/photo of a Purchase Order or BOQ (typed, scanned, or handwritten)</p>
                    </>
                  )}
                </button>
              </div>
              {aiFileResults.length > 0 && (
                <div className="space-y-1">
                  {aiFileResults.map((r, i) => (
                    <p key={i} className="text-xs px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]">
                      <span className="text-[#e8e4dc] font-medium">{r.fileName}</span>{' — '}
                      {r.error ? (
                        <span className="text-[#e06050]">{r.error}</span>
                      ) : (
                        <span className="text-[#5cba80]">{r.itemsExtracted} item{r.itemsExtracted === 1 ? '' : 's'} read{r.orderName ? ` as "${r.orderName}"` : ''}</span>
                      )}
                    </p>
                  ))}
                </div>
              )}
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
