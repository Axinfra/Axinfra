'use client';

import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface BOQItem {
  id: string;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
  plannedValue: number;
}

interface BOQ {
  id: string;
  phaseId: string | null;
  status: string;
  phase: { id: string; name: string; sortOrder: number } | null;
  items: BOQItem[];
  revisions: Array<{
    revisionNumber: number;
    reason: string;
    createdAt: string;
  }>;
}

interface Phase {
  id: string;
  name: string;
  boq: { id: string; status: string } | null;
}

interface ImportRow {
  phaseName: string;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
}

interface ImportResult {
  created: number;
  skipped: number;
  results: Array<{ phaseName: string; itemsAdded?: number; error?: string }>;
}

export default function BOQPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const prefilledPhaseId = searchParams.get('phaseId') ?? '';
  const projectId = params.projectId as string;
  const [error, setError] = useState('');

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    description: '',
    unit: '',
    plannedQty: '',
    rate: '',
  });

  // Revision reason modal
  const [revisionModal, setRevisionModal] = useState<{ boqId: string } | null>(null);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);

  // Inline confirm state (replaces browser confirm())
  const [confirmApproveBoqId, setConfirmApproveBoqId] = useState<string | null>(null);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<{ boqId: string; itemId: string } | null>(null);

  // Excel import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importParseNote, setImportParseNote] = useState('');
  const [importParseError, setImportParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Inline edit state for existing items
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemDraft, setEditItemDraft] = useState({
    description: '',
    unit: '',
    plannedQty: '',
    rate: '',
  });
  const [itemSaving, setItemSaving] = useState(false);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const permissions = (project?.permissions ?? {}) as Record<string, boolean>;

  const {
    data: boqs = [],
    isLoading: boqLoading,
    mutate: refetchBoqs,
  } = useSWR<BOQ[]>(
    projectId ? `/api/projects/${projectId}/boq` : null,
    jsonFetcher,
    { dedupingInterval: 5_000 },
  );

  const {
    data: phases = [],
    isLoading: phasesLoading,
    mutate: refetchPhases,
  } = useSWR<Phase[]>(
    projectId ? `/api/projects/${projectId}/phases` : null,
    jsonFetcher,
    { dedupingInterval: 5_000 },
  );

  const [selectedPhaseId, setSelectedPhaseId] = useState(prefilledPhaseId);
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) ?? null;
  const phaseHasBoq = selectedPhaseId
    ? Boolean(selectedPhase?.boq) || boqs.some((b) => b.phaseId === selectedPhaseId)
    : false;

  const loading = projectLoading || boqLoading || phasesLoading;

  const handleCreateBOQ = async () => {
    const res = await fetch(`/api/projects/${projectId}/boq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedPhaseId ? { phaseId: selectedPhaseId } : {}),
    });
    const data = await res.json();
    if (data.success) {
      void refetchBoqs();
      void refetchPhases();
    } else {
      setError(data.error);
    }
  };

  const handleAddItem = async (boqId: string) => {
    const qty = parseFloat(newItem.plannedQty);
    const rate = parseFloat(newItem.rate);

    // Optimistic update — add a temporary item immediately
    const tempId = `temp-${Date.now()}`;
    void refetchBoqs(
      (current = []) =>
        current.map((b) =>
          b.id === boqId
            ? {
                ...b,
                items: [
                  ...b.items,
                  {
                    id: tempId,
                    description: newItem.description,
                    unit: newItem.unit,
                    plannedQty: qty,
                    rate,
                    plannedValue: qty * rate,
                  },
                ],
              }
            : b,
        ),
      { revalidate: false },
    );

    setShowAddItem(false);
    setNewItem({ description: '', unit: '', plannedQty: '', rate: '' });

    const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: newItem.description,
        unit: newItem.unit,
        plannedQty: qty,
        rate,
      }),
    });

    const data = await res.json();
    if (data.success) {
      void refetchBoqs(); // sync real ID from server
    } else {
      void refetchBoqs(); // revert optimistic
      setError(data.error);
    }
  };

  const handleApproveBOQ = async (boqId: string) => {
    setConfirmApproveBoqId(null);

    // Optimistic update — show APPROVED immediately before server responds
    void refetchBoqs(
      (current) => current?.map((b) => b.id === boqId ? { ...b, status: 'APPROVED' } : b),
      { revalidate: false },
    );

    const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/approve`, {
      method: 'POST',
    });

    const data = await res.json();
    if (data.success) {
      void refetchBoqs();
    } else {
      void refetchBoqs(); // revert optimistic update
      setError(data.error);
    }
  };

  const handleEditItem = (item: BOQItem) => {
    setEditingItemId(item.id);
    setEditItemDraft({
      description: item.description,
      unit: item.unit,
      plannedQty: String(item.plannedQty),
      rate: String(item.rate),
    });
  };

  const handleUpdateItem = async (boqId: string, itemId: string) => {
    setItemSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          updates: {
            description: editItemDraft.description,
            unit: editItemDraft.unit,
            plannedQty: parseFloat(editItemDraft.plannedQty),
            rate: parseFloat(editItemDraft.rate),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingItemId(null);
        void refetchBoqs();
      } else {
        setError(data.error ?? 'Failed to update item');
      }
    } catch {
      setError('An error occurred');
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async (boqId: string, itemId: string) => {
    setConfirmDeleteItemId(null);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (data.success) {
        void refetchBoqs();
      } else {
        setError(data.error ?? 'Failed to delete item');
      }
    } catch {
      setError('An error occurred');
    }
  };

  const handleRejectBOQ = (boqId: string) => {
    setRevisionReason('');
    setRevisionModal({ boqId });
  };

  const handleSubmitRevision = async () => {
    if (!revisionModal || !revisionReason.trim()) return;
    setRevisionSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/boq/${revisionModal.boqId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: revisionReason.trim() }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setRevisionModal(null);
        void refetchBoqs();
        void refetchPhases();
      } else {
        setError(data.error);
      }
    } catch {
      setError('An error occurred');
    } finally {
      setRevisionSubmitting(false);
    }
  };

  const openImport = () => {
    setImportRows([]);
    setImportParseNote('');
    setImportParseError('');
    setImportResult(null);
    setShowImport(true);
  };

  const handleImportFile = async (file: File) => {
    setImportParseError('');
    setImportParseNote('');
    setImportRows([]);
    setImportResult(null);
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

      for (let i = 1; i < raw.length; i++) {
        const r = raw[i];
        const phaseName = String(r[0] ?? '').trim();
        const description = String(r[1] ?? '').trim();
        const unit = String(r[2] ?? '').trim();
        const qty = parseFloat(String(r[3] ?? ''));
        const rate = parseFloat(String(r[4] ?? ''));
        if (!phaseName && !description) continue;
        if (!phaseName || !description || !unit || isNaN(qty) || isNaN(rate) || qty <= 0 || rate <= 0) {
          skippedLines.push(i + 1);
          continue;
        }
        rows.push({ phaseName, description, unit, plannedQty: qty, rate });
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
    if (!importRows.length) return;
    setImporting(true);
    setImportParseError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importRows }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(data.data as ImportResult);
        void refetchBoqs();
        void refetchPhases();
      } else {
        setImportParseError(data.error ?? 'Import failed');
      }
    } catch {
      setImportParseError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  const currentBOQ = selectedPhaseId
    ? boqs.find((b) => b.phaseId === selectedPhaseId) ?? null
    : null;
  const totalValue = currentBOQ?.items.reduce((sum, item) => sum + item.plannedValue, 0) || 0;
  const canEditCurrentBOQ =
    permissions.canEditBOQ && currentBOQ && (currentBOQ.status === 'DRAFT' || currentBOQ.status === 'REVISED');
  const canOwnerReview =
    permissions.canApproveBOQ &&
    currentBOQ &&
    (currentBOQ.status === 'DRAFT' || currentBOQ.status === 'REVISED') &&
    currentBOQ.items.length > 0;

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Bill of Quantities</h1>
          {permissions.canEditBOQ && (
            <button onClick={openImport} className="btn btn-sm btn-secondary">
              ↑ Import Excel
            </button>
          )}
        </div>

        {/* Hidden file input for Excel upload */}
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

        {error && <div className="alert alert-error">{error}</div>}

        {phases.length > 0 && (
          <div className="card">
            <div className="card-body">
              <label className="label">Phase</label>
              {prefilledPhaseId ? (
                <div className="input bg-[rgba(255,255,255,0.03)] text-[rgba(232,228,220,0.55)] cursor-not-allowed">
                  {selectedPhase?.name ?? prefilledPhaseId}
                </div>
              ) : (
                <select
                  className="input"
                  value={selectedPhaseId}
                  onChange={(e) => {
                    setSelectedPhaseId(e.target.value);
                    setError('');
                  }}
                >
                  <option value="">Select phase</option>
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {!currentBOQ ? (
          <div className="card">
            <div className="card-body space-y-5 py-8">
              <p className="text-[rgba(232,228,220,0.55)] text-center">
                {selectedPhaseId
                  ? 'No BOQ created for this phase yet'
                  : permissions.canEditBOQ
                  ? 'Select a phase to view or create its BOQ'
                  : 'Select a phase to view its BOQ'}
              </p>

              {permissions.canEditBOQ && (
                <>
                  {phaseHasBoq && (
                    <p className="text-sm text-[#e06050] text-center">
                      This phase already has a BOQ.
                    </p>
                  )}

                  <div className="flex justify-center">
                    <button
                      onClick={handleCreateBOQ}
                      disabled={!selectedPhaseId || phaseHasBoq}
                      className="btn btn-primary disabled:opacity-50"
                    >
                      Create BOQ
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* BOQ Header */}
            <div className="card">
              <div className="card-body">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3 flex-wrap">
                    {currentBOQ.status === 'APPROVED' ? (
                      <span className="badge badge-verified flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approved
                      </span>
                    ) : currentBOQ.status === 'REVISED' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,88,12,0.12)] text-[#f97316] font-medium">
                        Revised
                      </span>
                    ) : (
                      <span className="badge badge-draft">{currentBOQ.status}</span>
                    )}
                    {currentBOQ.phase && (
                      <span className="text-sm text-[rgba(232,228,220,0.55)]">
                        {currentBOQ.phase.name}
                      </span>
                    )}
                    {currentBOQ.revisions.length > 0 && (
                      <span className="text-sm text-[rgba(232,228,220,0.55)]">
                        Revision {currentBOQ.revisions.length}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[rgba(232,228,220,0.55)]">Total Value</p>
                    <p className="text-2xl font-bold text-[#e8e4dc]">{formatCurrency(totalValue)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Revision banner */}
            {currentBOQ.status === 'REVISED' && canEditCurrentBOQ && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(234,88,12,0.08)] border border-[rgba(249,115,22,0.25)]">
                <span className="text-[#f97316] text-lg leading-none mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-medium text-[#f97316]">Revision Required</p>
                  <p className="text-xs text-[rgba(249,115,22,0.7)] mt-0.5">
                    Edit the items below and the Owner will re-approve.
                  </p>
                </div>
              </div>
            )}

            {/* BOQ Items */}
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <h2 className="text-lg font-semibold">Items ({currentBOQ.items.length})</h2>
                {canEditCurrentBOQ && (
                  <button onClick={() => setShowAddItem(true)} className="btn btn-sm btn-primary">
                    Add Item
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Unit</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Value</th>
                      {canEditCurrentBOQ && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {currentBOQ.items.map((item) => {
                      const isEditingRow = editingItemId === item.id;
                      return isEditingRow ? (
                        <tr key={item.id} className="bg-[rgba(255,255,255,0.02)]">
                          <td>
                            <input
                              autoFocus
                              type="text"
                              className="input py-1 text-sm w-full"
                              value={editItemDraft.description}
                              onChange={(e) => setEditItemDraft({ ...editItemDraft, description: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="input py-1 text-sm w-20"
                              value={editItemDraft.unit}
                              onChange={(e) => setEditItemDraft({ ...editItemDraft, unit: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="input py-1 text-sm w-24 text-right"
                              value={editItemDraft.plannedQty}
                              onChange={(e) => setEditItemDraft({ ...editItemDraft, plannedQty: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="input py-1 text-sm w-28 text-right"
                              value={editItemDraft.rate}
                              onChange={(e) => setEditItemDraft({ ...editItemDraft, rate: e.target.value })}
                            />
                          </td>
                          <td className="text-right text-[rgba(232,228,220,0.4)] text-sm">—</td>
                          <td className="text-right whitespace-nowrap">
                            <button
                              onClick={() => void handleUpdateItem(currentBOQ.id, item.id)}
                              disabled={itemSaving}
                              className="btn btn-sm btn-primary mr-1"
                            >
                              {itemSaving ? '…' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingItemId(null)}
                              className="btn btn-sm btn-secondary"
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={item.id}>
                          <td>{item.description}</td>
                          <td>{item.unit}</td>
                          <td className="text-right">{item.plannedQty}</td>
                          <td className="text-right">{formatCurrency(item.rate)}</td>
                          <td className="text-right font-medium">{formatCurrency(item.plannedValue)}</td>
                          {canEditCurrentBOQ && (
                            <td className="text-right whitespace-nowrap">
                              <button
                                onClick={() => handleEditItem(item)}
                                className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[#c4a35a] transition-colors mr-3"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setConfirmDeleteItemId({ boqId: currentBOQ.id, itemId: item.id })}
                                className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[#e06050] transition-colors"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {currentBOQ.items.length === 0 && (
                      <tr>
                        <td colSpan={canEditCurrentBOQ ? 6 : 5} className="text-center text-[rgba(232,228,220,0.55)] py-8">
                          No items added yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {currentBOQ.items.length > 0 && (
                    <tfoot>
                      <tr className="bg-[rgba(255,255,255,0.03)] font-semibold">
                        <td colSpan={canEditCurrentBOQ ? 5 : 4} className="text-right">Total</td>
                        <td className="text-right">{formatCurrency(totalValue)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Actions */}
            {currentBOQ.status === 'APPROVED' ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-[rgba(92,186,128,0.08)] border border-[rgba(92,186,128,0.2)]">
                <CheckCircle2 className="w-5 h-5 text-[#5cba80] shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#5cba80]">BOQ Approved</p>
                  <p className="text-xs text-[rgba(92,186,128,0.7)] mt-0.5">This BOQ is locked.</p>
                </div>
                {permissions.canApproveBOQ && (
                  <button onClick={() => handleRejectBOQ(currentBOQ.id)} className="btn btn-secondary ml-auto">
                    Request Revision
                  </button>
                )}
              </div>
            ) : canOwnerReview && (
              <div className="flex justify-end gap-3">
                <button onClick={() => handleRejectBOQ(currentBOQ.id)} className="btn btn-secondary">
                  Send to Revision
                </button>
                <button onClick={() => setConfirmApproveBoqId(currentBOQ.id)} className="btn btn-success">
                  Approve BOQ
                </button>
              </div>
            )}

            {/* Revisions */}
            {currentBOQ.revisions.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h2 className="text-lg font-semibold">Revision History</h2>
                </div>
                <div className="card-body">
                  <ul className="space-y-2">
                    {currentBOQ.revisions.map((rev) => (
                      <li key={rev.revisionNumber} className="text-sm">
                        <span className="font-medium">Revision {rev.revisionNumber}:</span>{' '}
                        <span className="text-[rgba(232,228,220,0.55)]">{rev.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Revision Reason Modal */}
      {revisionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-1 text-[#f97316]">Request Revision</h2>
              <p className="text-sm text-[rgba(232,228,220,0.55)] mb-4">
                Describe what needs to be changed. The PMC will see this message.
              </p>
              <textarea
                autoFocus
                rows={4}
                className="input resize-none w-full"
                placeholder="e.g. Quantities for earthwork items are incorrect…"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
              />
              {error && <p className="text-sm text-[#e06050] mt-2">{error}</p>}
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setRevisionModal(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSubmitRevision()}
                  disabled={revisionSubmitting || !revisionReason.trim()}
                  className="btn bg-[#f97316] text-white hover:bg-[#ea7011] disabled:opacity-50"
                >
                  {revisionSubmitting ? 'Sending…' : 'Send for Revision'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && currentBOQ && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Add BOQ Item</h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Description</label>
                  <input
                    type="text"
                    className="input"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input
                    type="text"
                    className="input"
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    placeholder="e.g., sqm, nos, rmt"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Quantity</label>
                    <input
                      type="number"
                      className="input"
                      value={newItem.plannedQty}
                      onChange={(e) => setNewItem({ ...newItem, plannedQty: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Rate</label>
                    <input
                      type="number"
                      className="input"
                      value={newItem.rate}
                      onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button onClick={() => setShowAddItem(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button onClick={() => handleAddItem(currentBOQ.id)} className="btn btn-primary">
                    Add Item
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Excel Modal ────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl w-full max-w-2xl">
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-[#e8e4dc]">Import BOQ from Excel</h2>
                <button
                  onClick={() => setShowImport(false)}
                  className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] text-xl leading-none"
                >
                  ✕
                </button>
              </div>

              {importResult ? (
                /* ── Step 3: Results ── */
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg border ${importResult.created > 0 ? 'bg-[rgba(92,186,128,0.07)] border-[rgba(92,186,128,0.2)]' : 'bg-[rgba(224,96,80,0.07)] border-[rgba(224,96,80,0.2)]'}`}>
                    <p className={`font-medium text-sm ${importResult.created > 0 ? 'text-[#5cba80]' : 'text-[#e06050]'}`}>
                      {importResult.created > 0
                        ? `✓ ${importResult.created} items imported successfully`
                        : 'No items were imported'}
                      {importResult.skipped > 0 && ` · ${importResult.skipped} skipped`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {importResult.results.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-[rgba(255,255,255,0.05)] last:border-0">
                        <span className="text-[#e8e4dc] font-medium">{r.phaseName}</span>
                        {r.error
                          ? <span className="text-[#e06050] text-xs">{r.error}</span>
                          : <span className="text-[#5cba80] text-xs">{r.itemsAdded} items added</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => { setShowImport(false); }} className="btn btn-secondary">Close</button>
                    <button onClick={() => { setImportRows([]); setImportResult(null); setImportParseNote(''); setImportParseError(''); }} className="btn btn-primary">Import More</button>
                  </div>
                </div>
              ) : importRows.length > 0 ? (
                /* ── Step 2: Preview + phase mapping ── */
                (() => {
                  const byPhase = new Map<string, ImportRow[]>();
                  for (const row of importRows) {
                    const list = byPhase.get(row.phaseName) ?? [];
                    list.push(row);
                    byPhase.set(row.phaseName, list);
                  }
                  const groups = Array.from(byPhase.entries()).map(([name, rows]) => ({
                    name,
                    rows,
                    matched: phases.find((p) => p.name.toLowerCase() === name.toLowerCase()),
                    total: rows.reduce((s, r) => s + r.plannedQty * r.rate, 0),
                  }));
                  const unmatchedCount = groups.filter((g) => !g.matched).length;
                  return (
                    <div className="space-y-4">
                      {importParseNote && (
                        <p className="text-xs text-[rgba(249,115,22,0.8)] bg-[rgba(249,115,22,0.07)] border border-[rgba(249,115,22,0.2)] rounded-lg px-3 py-2">{importParseNote}</p>
                      )}
                      <p className="text-sm text-[rgba(232,228,220,0.55)]">
                        <span className="text-[#e8e4dc] font-medium">{importRows.length} items</span> across <span className="text-[#e8e4dc] font-medium">{groups.length} phases</span> — auto-matched below
                      </p>
                      <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)]">
                              <th className="text-left px-4 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Phase (from Excel)</th>
                              <th className="text-center px-3 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Status</th>
                              <th className="text-right px-3 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Items</th>
                              <th className="text-right px-4 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Total Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groups.map((g, i) => (
                              <tr key={i} className="border-b border-[rgba(255,255,255,0.04)] last:border-0">
                                <td className="px-4 py-2.5 text-[#e8e4dc]">{g.name}</td>
                                <td className="px-3 py-2.5 text-center">
                                  {g.matched
                                    ? <span className="text-xs text-[#5cba80]">✓ Matched</span>
                                    : <span className="text-xs text-[#e06050]">✗ Not found</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right text-[rgba(232,228,220,0.65)]">{g.rows.length}</td>
                                <td className="px-4 py-2.5 text-right text-[#c4a35a] font-medium">
                                  ₹{g.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {unmatchedCount > 0 && (
                        <p className="text-xs text-[#e06050] bg-[rgba(224,96,80,0.07)] border border-[rgba(224,96,80,0.2)] rounded-lg px-3 py-2">
                          {unmatchedCount} phase{unmatchedCount > 1 ? 's' : ''} not found in this project — those items will be skipped. Check spelling matches the Phase Reference sheet.
                        </p>
                      )}
                      {importParseError && <p className="text-xs text-[#e06050]">{importParseError}</p>}
                      <div className="flex justify-end gap-3 pt-1">
                        <button onClick={() => setImportRows([])} className="btn btn-secondary">← Re-upload</button>
                        <button
                          onClick={() => void handleImport()}
                          disabled={importing || groups.every((g) => !g.matched)}
                          className="btn btn-primary disabled:opacity-50"
                        >
                          {importing ? 'Importing…' : `Import ${importRows.length} Items`}
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* ── Step 1: Format guide + upload ── */
                <div className="space-y-5">
                  {/* Format table */}
                  <div>
                    <p className="text-xs font-medium text-[rgba(232,228,220,0.45)] uppercase tracking-wider mb-2">Required Columns (in order)</p>
                    <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)]">
                            {['Phase', 'Description', 'Unit', 'Quantity', 'Rate (₹)'].map((h) => (
                              <th key={h} className="text-left px-3 py-2 text-xs text-[rgba(232,228,220,0.55)] font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="text-[rgba(232,228,220,0.65)]">
                          <tr className="border-b border-[rgba(255,255,255,0.04)]">
                            <td className="px-3 py-2 text-[#c4a35a]">Foundation</td>
                            <td className="px-3 py-2">Excavation for columns</td>
                            <td className="px-3 py-2">cum</td>
                            <td className="px-3 py-2">50</td>
                            <td className="px-3 py-2">850</td>
                          </tr>
                          <tr className="border-b border-[rgba(255,255,255,0.04)]">
                            <td className="px-3 py-2 text-[#c4a35a]">Foundation</td>
                            <td className="px-3 py-2">PCC M10 below footing</td>
                            <td className="px-3 py-2">cum</td>
                            <td className="px-3 py-2">12</td>
                            <td className="px-3 py-2">4200</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 text-[#c4a35a]">Structure</td>
                            <td className="px-3 py-2">RCC M25 columns</td>
                            <td className="px-3 py-2">cum</td>
                            <td className="px-3 py-2">18</td>
                            <td className="px-3 py-2">8500</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">Phase name must match your project phases exactly · Value column is auto-calculated</p>
                  </div>

                  {/* Download template */}
                  <a
                    href={`/api/projects/${projectId}/boq/template`}
                    download
                    className="flex items-center gap-2 text-sm text-[#c4a35a] hover:text-[#d4b36a] transition-colors"
                  >
                    <span>↓</span>
                    <span>Download template with your project&apos;s phase names pre-filled</span>
                  </a>

                  {/* Upload zone */}
                  <div>
                    <p className="text-xs font-medium text-[rgba(232,228,220,0.45)] uppercase tracking-wider mb-2">Upload File</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-[rgba(255,255,255,0.1)] rounded-xl py-8 px-4 text-center hover:border-[rgba(196,163,90,0.4)] hover:bg-[rgba(196,163,90,0.03)] transition-all group"
                    >
                      <p className="text-[rgba(232,228,220,0.55)] group-hover:text-[rgba(232,228,220,0.8)] text-sm">
                        Click to browse or drop your .xlsx file here
                      </p>
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
      )}

      {/* Confirm: Approve BOQ */}
      {confirmApproveBoqId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#e8e4dc]">Approve BOQ?</h2>
            <p className="text-sm text-[rgba(232,228,220,0.55)]">
              The BOQ will be locked and PMC will no longer be able to edit it.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmApproveBoqId(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void handleApproveBOQ(confirmApproveBoqId)} className="btn btn-success">
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm: Delete BOQ Item */}
      {confirmDeleteItemId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#e8e4dc]">Delete this item?</h2>
            <p className="text-sm text-[rgba(232,228,220,0.55)]">This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDeleteItemId(null)} className="btn btn-secondary">Cancel</button>
              <button
                onClick={() => void handleDeleteItem(confirmDeleteItemId.boqId, confirmDeleteItemId.itemId)}
                className="btn bg-[rgba(224,96,80,0.15)] text-[#e06050] border border-[rgba(224,96,80,0.3)] hover:bg-[rgba(224,96,80,0.25)]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
