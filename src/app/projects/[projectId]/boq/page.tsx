'use client';

import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { useState, useRef, useEffect, useMemo } from 'react';
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
  results: Array<{ phaseName: string; itemsAdded?: number; error?: string; phaseCreated?: boolean }>;
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

  // Inline confirm state
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
  // Which phase groups (by name from the Excel) the user wants included in the import.
  // Matched phases default to included; unmatched (new) phases default to excluded.
  const [includedPhases, setIncludedPhases] = useState<Set<string>>(new Set());

  // Inline edit state for existing items
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemDraft, setEditItemDraft] = useState({
    description: '',
    unit: '',
    plannedQty: '',
    rate: '',
  });
  const [itemSaving, setItemSaving] = useState(false);

  // Track which phase we've already auto-created a BOQ for so we don't loop
  const autoCreateAttemptedRef = useRef<string | null>(null);
  const [autoCreating, setAutoCreating] = useState(false);

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

  // Group parsed import rows by phase name and match against existing project phases.
  const importGroups = useMemo(() => {
    const byPhase = new Map<string, ImportRow[]>();
    for (const row of importRows) {
      const list = byPhase.get(row.phaseName) ?? [];
      list.push(row);
      byPhase.set(row.phaseName, list);
    }
    return Array.from(byPhase.entries()).map(([name, rows]) => ({
      name,
      rows,
      matched: phases.find((p) => p.name.toLowerCase().trim() === name.toLowerCase().trim()) ?? null,
      total: rows.reduce((s, r) => s + r.plannedQty * r.rate, 0),
    }));
  }, [importRows, phases]);

  // Default checkbox state whenever a new file is parsed: matched phases start included,
  // new (unmatched) phases start excluded — the user opts in per-phase from there.
  useEffect(() => {
    if (importRows.length === 0) return;
    setIncludedPhases(new Set(importGroups.filter((g) => g.matched).map((g) => g.name)));
  // Only re-run when the parsed rows change (a fresh upload), not on every importGroups recompute.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importRows]);

  const togglePhaseIncluded = (name: string) => {
    setIncludedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // Sync when the URL ?phaseId changes — e.g. navigating from overview → different phase.
  // useState only uses the initial value, so without this the old phase stays selected.
  useEffect(() => {
    if (!prefilledPhaseId || prefilledPhaseId === selectedPhaseId) return;
    setSelectedPhaseId(prefilledPhaseId);
    autoCreateAttemptedRef.current = null;
    setError('');
  // selectedPhaseId intentionally excluded — we only want to react to URL changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledPhaseId]);

  const loading = projectLoading || boqLoading || phasesLoading;

  const currentBOQ = selectedPhaseId
    ? boqs.find((b) => b.phaseId === selectedPhaseId) ?? null
    : null;

  // Auto-create a BOQ when PMC lands on the page with a phase selected and no BOQ exists yet —
  // whether they arrived via the "Create BOQ" link or picked the phase from the dropdown here.
  // The BOQ page never exposes a "Create BOQ" action itself; it just goes straight to Add Items.
  // We track which phase we've attempted so this never loops.
  useEffect(() => {
    if (
      loading ||
      !selectedPhaseId ||
      currentBOQ ||
      !permissions.canEditBOQ ||
      autoCreateAttemptedRef.current === selectedPhaseId
    ) return;

    autoCreateAttemptedRef.current = selectedPhaseId;
    setAutoCreating(true);
    setError('');

    fetch(`/api/projects/${projectId}/boq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phaseId: selectedPhaseId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success || data.error === 'This phase already has a BOQ') {
          // Succeeded or BOQ already existed — refetch to get the real record
          void refetchBoqs();
          void refetchPhases();
        } else {
          setError(data.error ?? 'Failed to set up BOQ');
          // Reset so the user can retry via the button
          autoCreateAttemptedRef.current = null;
        }
      })
      .catch(() => {
        setError('Failed to set up BOQ. Please try again.');
        autoCreateAttemptedRef.current = null;
      })
      .finally(() => setAutoCreating(false));
  }, [loading, selectedPhaseId, currentBOQ, permissions.canEditBOQ, projectId, refetchBoqs, refetchPhases]);

  // Reset auto-create tracking when the user picks a different phase from the dropdown
  const handlePhaseChange = (phaseId: string) => {
    setSelectedPhaseId(phaseId);
    setError('');
    if (phaseId !== autoCreateAttemptedRef.current) {
      autoCreateAttemptedRef.current = null;
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
      void refetchBoqs();
    } else {
      void refetchBoqs();
      setError(data.error);
    }
  };

  const handleApproveBOQ = async (boqId: string) => {
    setConfirmApproveBoqId(null);

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
      void refetchBoqs();
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

  const handleSubmitForApproval = async (boqId: string) => {
    // Optimistically mark as pending so UI updates immediately
    void refetchBoqs(
      (current) => current?.map((b) => b.id === boqId ? { ...b, status: 'PENDING_APPROVAL' } : b),
      { revalidate: false },
    );

    const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/submit`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      void refetchBoqs();
      void refetchPhases();
    } else {
      void refetchBoqs(); // revert
      setError(data.error ?? 'Failed to submit for approval');
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
    setIncludedPhases(new Set());
    setShowImport(true);
  };

  const handleImportFile = async (file: File) => {
    setImportParseError('');
    setImportParseNote('');
    setImportRows([]);
    setImportResult(null);
    setIncludedPhases(new Set());
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
    const selectedRows = importRows.filter((r) => includedPhases.has(r.phaseName));
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

  const totalValue = currentBOQ?.items.reduce((sum, item) => sum + item.plannedValue, 0) || 0;

  // PMC can edit items only when DRAFT or REVISED (not while awaiting approval)
  const canEditCurrentBOQ =
    permissions.canEditBOQ && currentBOQ && (currentBOQ.status === 'DRAFT' || currentBOQ.status === 'REVISED');
  // PMC can send for approval when DRAFT/REVISED and has at least one item
  const canSendForApproval =
    permissions.canEditBOQ &&
    currentBOQ &&
    (currentBOQ.status === 'DRAFT' || currentBOQ.status === 'REVISED') &&
    currentBOQ.items.length > 0;
  // Owner can approve/reject only when PMC has submitted (PENDING_APPROVAL)
  const canOwnerReview =
    permissions.canApproveBOQ &&
    currentBOQ &&
    currentBOQ.status === 'PENDING_APPROVAL' &&
    currentBOQ.items.length > 0;

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Bill of Quantities</h1>
          {permissions.canEditBOQ && currentBOQ && (
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

        {error && (
          <div className="alert alert-error flex items-center justify-between">
            <span>{error}</span>
            {!currentBOQ && permissions.canEditBOQ && selectedPhaseId && (
              <button
                onClick={() => {
                  autoCreateAttemptedRef.current = null;
                  setError('');
                }}
                className="btn btn-sm btn-secondary ml-4 shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Phase selector — only show if no phase pre-filled from URL */}
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
                  onChange={(e) => handlePhaseChange(e.target.value)}
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

        {/* ── No phase selected ── */}
        {!selectedPhaseId && (
          <div className="card">
            <div className="card-body py-10 text-center">
              <p className="text-[rgba(232,228,220,0.55)]">
                Select a phase to view its BOQ
              </p>
            </div>
          </div>
        )}

        {/* ── Phase selected but BOQ not ready yet ── */}
        {selectedPhaseId && !currentBOQ && (
          <div className="card">
            <div className="card-body py-10">
              {autoCreating ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-[var(--ax-accent)] border-t-transparent animate-spin" />
                  <p className="text-sm text-[rgba(232,228,220,0.45)]">Setting up BOQ…</p>
                </div>
              ) : !permissions.canEditBOQ ? (
                <p className="text-center text-[rgba(232,228,220,0.55)]">
                  No BOQ created for this phase yet
                </p>
              ) : null /* PMC: error (if any) is shown above with a Retry button */}
            </div>
          </div>
        )}

        {/* ── BOQ exists ── */}
        {currentBOQ && (
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
                    ) : currentBOQ.status === 'PENDING_APPROVAL' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,179,8,0.15)] text-[#eab308] font-medium">
                        Pending Approval
                      </span>
                    ) : currentBOQ.status === 'REVISED' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,88,12,0.12)] text-[#f97316] font-medium">
                        Needs Revision
                      </span>
                    ) : (
                      <span className="badge badge-draft">Draft</span>
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

            {/* Status banners */}
            {currentBOQ.status === 'REVISED' && permissions.canEditBOQ && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(234,88,12,0.08)] border border-[rgba(249,115,22,0.25)]">
                <span className="text-[#f97316] text-lg leading-none mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-medium text-[#f97316]">Revision Required</p>
                  <p className="text-xs text-[rgba(249,115,22,0.7)] mt-0.5">
                    The Owner has requested changes. Edit the items below, then send for approval again.
                  </p>
                </div>
              </div>
            )}
            {currentBOQ.status === 'PENDING_APPROVAL' && permissions.canEditBOQ && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(234,179,8,0.07)] border border-[rgba(234,179,8,0.25)]">
                <span className="text-[#eab308] text-lg leading-none mt-0.5">⏳</span>
                <div>
                  <p className="text-sm font-medium text-[#eab308]">Awaiting Owner Approval</p>
                  <p className="text-xs text-[rgba(234,179,8,0.7)] mt-0.5">
                    BOQ submitted. Items are locked until the Owner reviews.
                  </p>
                </div>
              </div>
            )}
            {currentBOQ.status === 'PENDING_APPROVAL' && permissions.canApproveBOQ && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(234,179,8,0.07)] border border-[rgba(234,179,8,0.25)]">
                <span className="text-[#eab308] text-lg leading-none mt-0.5">👁</span>
                <div>
                  <p className="text-sm font-medium text-[#eab308]">BOQ Submitted for Your Approval</p>
                  <p className="text-xs text-[rgba(234,179,8,0.7)] mt-0.5">
                    Review the items below, then approve or request revisions.
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
                    + Add Item
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
                                className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[var(--ax-accent)] transition-colors mr-3"
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
                          {canEditCurrentBOQ
                            ? 'No items yet — click "+ Add Item" above to get started'
                            : 'No items added yet'}
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
            ) : canOwnerReview ? (
              // CLIENT: BOQ is PENDING_APPROVAL — show Approve / Request Revision
              <div className="flex justify-end gap-3">
                <button onClick={() => handleRejectBOQ(currentBOQ.id)} className="btn btn-secondary">
                  Request Revision
                </button>
                <button onClick={() => setConfirmApproveBoqId(currentBOQ.id)} className="btn btn-success">
                  Approve BOQ
                </button>
              </div>
            ) : canSendForApproval ? (
              // PMC: BOQ is DRAFT or REVISED with items — send to client for review
              <div className="flex justify-end">
                <button
                  onClick={() => void handleSubmitForApproval(currentBOQ.id)}
                  className="btn btn-primary"
                >
                  Send for Approval
                </button>
              </div>
            ) : null}

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

      {/* ── Revision Reason Modal ── */}
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
                <button onClick={() => setRevisionModal(null)} className="btn btn-secondary">
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

      {/* ── Add Item Modal ── */}
      {showAddItem && currentBOQ && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Add BOQ Item</h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Description</label>
                  <input
                    autoFocus
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
                  <button
                    onClick={() => void handleAddItem(currentBOQ.id)}
                    disabled={!newItem.description || !newItem.unit || !newItem.plannedQty || !newItem.rate}
                    className="btn btn-primary disabled:opacity-50"
                  >
                    Add Item
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Excel Modal ── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl w-full max-w-2xl">
            <div className="p-6 space-y-5">
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
                        <span className="text-[#e8e4dc] font-medium flex items-center gap-2">
                          {r.phaseName}
                          {r.phaseCreated && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.15)] text-[var(--ax-accent)]">
                              New Phase
                            </span>
                          )}
                        </span>
                        {r.error
                          ? <span className="text-[#e06050] text-xs">{r.error}</span>
                          : <span className="text-[#5cba80] text-xs">{r.itemsAdded} items added</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowImport(false)} className="btn btn-secondary">Close</button>
                    <button onClick={() => { setImportRows([]); setImportResult(null); setImportParseNote(''); setImportParseError(''); setIncludedPhases(new Set()); }} className="btn btn-primary">Import More</button>
                  </div>
                </div>
              ) : importRows.length > 0 ? (
                (() => {
                  const groups = importGroups;
                  const unmatchedCount = groups.filter((g) => !g.matched).length;
                  const selectedGroups = groups.filter((g) => includedPhases.has(g.name));
                  const selectedItemCount = selectedGroups.reduce((s, g) => s + g.rows.length, 0);
                  const allChecked = groups.length > 0 && groups.every((g) => includedPhases.has(g.name));
                  const toggleAll = () => {
                    setIncludedPhases(allChecked ? new Set() : new Set(groups.map((g) => g.name)));
                  };
                  return (
                    <div className="space-y-4">
                      {importParseNote && (
                        <p className="text-xs text-[rgba(249,115,22,0.8)] bg-[rgba(249,115,22,0.07)] border border-[rgba(249,115,22,0.2)] rounded-lg px-3 py-2">{importParseNote}</p>
                      )}
                      <p className="text-sm text-[rgba(232,228,220,0.55)]">
                        <span className="text-[#e8e4dc] font-medium">{importRows.length} items</span> across <span className="text-[#e8e4dc] font-medium">{groups.length} phases</span>
                        {' — '}
                        <span className="text-[var(--ax-accent)] font-medium">{selectedItemCount} items in {selectedGroups.length} phase{selectedGroups.length === 1 ? '' : 's'}</span> selected
                      </p>
                      <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)]">
                              <th className="text-center px-3 py-2.5 w-10">
                                <input
                                  type="checkbox"
                                  checked={allChecked}
                                  onChange={toggleAll}
                                  className="w-4 h-4 accent-[var(--ax-accent)] cursor-pointer"
                                  aria-label="Include all phases"
                                />
                              </th>
                              <th className="text-left px-4 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Phase (from Excel)</th>
                              <th className="text-center px-3 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Status</th>
                              <th className="text-right px-3 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Items</th>
                              <th className="text-right px-4 py-2.5 text-xs text-[rgba(232,228,220,0.45)] font-medium">Total Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groups.map((g, i) => {
                              const included = includedPhases.has(g.name);
                              return (
                                <tr
                                  key={i}
                                  className={`border-b border-[rgba(255,255,255,0.04)] last:border-0 ${included ? '' : 'opacity-45'}`}
                                >
                                  <td className="px-3 py-2.5 text-center">
                                    <input
                                      type="checkbox"
                                      checked={included}
                                      onChange={() => togglePhaseIncluded(g.name)}
                                      className="w-4 h-4 accent-[var(--ax-accent)] cursor-pointer"
                                      aria-label={`Include ${g.name}`}
                                    />
                                  </td>
                                  <td className="px-4 py-2.5 text-[#e8e4dc]">{g.name}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    {g.matched ? (
                                      <span className="text-xs text-[#5cba80]">✓ Matched</span>
                                    ) : included ? (
                                      <span className="text-xs text-[var(--ax-accent)]">+ New phase</span>
                                    ) : (
                                      <span className="text-xs text-[rgba(232,228,220,0.4)]">Not found — excluded</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-[rgba(232,228,220,0.65)]">{g.rows.length}</td>
                                  <td className="px-4 py-2.5 text-right text-[var(--ax-accent)] font-medium">
                                    ₹{g.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {unmatchedCount > 0 && (
                        <p className="text-xs text-[rgba(232,228,220,0.45)] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2">
                          {unmatchedCount} phase{unmatchedCount > 1 ? 's' : ''} not found in this project. Check the box to create {unmatchedCount > 1 ? 'them' : 'it'} automatically along with the BOQ — leave unchecked to skip.
                        </p>
                      )}
                      {importParseError && <p className="text-xs text-[#e06050]">{importParseError}</p>}
                      <div className="flex justify-end gap-3 pt-1">
                        <button onClick={() => setImportRows([])} className="btn btn-secondary">← Re-upload</button>
                        <button
                          onClick={() => void handleImport()}
                          disabled={importing || selectedGroups.length === 0}
                          className="btn btn-primary disabled:opacity-50"
                        >
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
                  <a
                    href={`/api/projects/${projectId}/boq/template`}
                    download
                    className="flex items-center gap-2 text-sm text-[var(--ax-accent)] hover:underline"
                  >
                    <span>↓</span>
                    <span>Download template with your project&apos;s phase names pre-filled</span>
                  </a>
                  <div>
                    <p className="text-xs font-medium text-[rgba(232,228,220,0.45)] uppercase tracking-wider mb-2">Upload File</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-[rgba(255,255,255,0.1)] rounded-xl py-8 px-4 text-center hover:border-[rgba(var(--ax-accent-rgb),0.4)] hover:bg-[rgba(var(--ax-accent-rgb),0.03)] transition-all group"
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

      {/* ── Confirm: Approve BOQ ── */}
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

      {/* ── Confirm: Delete BOQ Item ── */}
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
