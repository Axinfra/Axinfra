'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate, formatCurrency } from '@/lib/utils';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import {
  FileText, CheckCircle2, Clock, XCircle, Upload, Link as LinkIcon,
  Plus, Download, History, AlertCircle, Zap, FileUp, Globe, X,
  ArrowRight, Layers, Check, SlidersHorizontal, LayoutGrid, List,
  ChevronDown, ChevronRight as ChevronRightIcon, Tag, Minus, Calendar,
  Eye, Trash2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DrawingSet {
  id: string; name: string; description?: string; cost: number; currency: string;
  status: string; createdById: string; createdByName: string;
  requestedByName?: string; paymentReleaserName?: string;
  requestedAt?: string; dueDate?: string; deliveredAt?: string; approvedAt?: string; paidAt?: string;
  createdAt: string; rowCount: number;
  rowStats: { total: number; pending: number; submitted: number; approved: number; rejected: number; paid: number };
  rows: DrawingRow[];
}

interface DrawingVersion {
  id: string; versionNumber: number; uploadType: string;
  fileUrl: string; fileName?: string; fileSizeKb?: number;
  uploadedById: string; uploadedBy: { id: string; name: string };
  uploadedAt: string; reviewStatus: string; rejectionReason?: string;
  reviewedBy?: { id: string; name: string }; reviewedAt?: string; isCurrent: boolean;
}

interface DrawingRow {
  id: string; serialNo: number; category: string; name: string; floor: string;
  description?: string; status: string; dueDate?: string; createdById: string;
  createdBy: { id: string; name: string };
  set?: { id: string; name: string; status: string } | null;
  versions: DrawingVersion[];
}

interface OverviewStats {
  sets: { total: number; approved: number; paid: number };
  rows: { total: number; pending: number; submitted: number; approved: number; rejected: number };
  pendingReview: number;
}

type ManualDrawingDraft = {
  category: string;
  name: string;
  floor: string;
  description: string;
};

// ── Configs ────────────────────────────────────────────────────────────────────

const SET_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:            { label: 'Draft',       color: 'text-[rgba(232,228,220,0.55)]', bg: 'bg-[rgba(255,255,255,0.06)]' },
  SUBMITTED_TO_PMC: { label: 'Submitted',   color: 'text-[#c4a35a]',               bg: 'bg-[rgba(196,163,90,0.12)]' },
  REQUESTED:        { label: 'Requested',   color: 'text-[#818cf8]',               bg: 'bg-[rgba(129,140,248,0.12)]' },
  IN_PROGRESS:      { label: 'In Progress', color: 'text-[#38bdf8]',               bg: 'bg-[rgba(56,189,248,0.12)]' },
  DELIVERED:        { label: 'Delivered',   color: 'text-[#fb923c]',               bg: 'bg-[rgba(251,146,60,0.12)]' },
  APPROVED:         { label: 'Approved',    color: 'text-[#6ee7b7]',               bg: 'bg-[rgba(110,231,183,0.12)]' },
  PAID:             { label: 'Paid',        color: 'text-[#a78bfa]',               bg: 'bg-[rgba(167,139,250,0.12)]' },
};

const ROW_STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  PENDING:   { label: 'Pending',   dot: 'bg-[rgba(255,255,255,0.25)]' },
  SUBMITTED: { label: 'Submitted', dot: 'bg-[#c4a35a]' },
  APPROVED:  { label: 'Approved',  dot: 'bg-[#6ee7b7]' },
  REJECTED:  { label: 'Rejected',  dot: 'bg-[#e06050]' },
};

const FLOOR_LABELS: Record<string, string> = {
  BASEMENT: 'Basement', GROUND_FLOOR: 'Ground', FIRST_FLOOR: '1st',
  SECOND_FLOOR: '2nd', TERRACE: 'Terrace', ALL_FLOORS: 'All',
};


const createBlankDrawing = (): ManualDrawingDraft => ({
  category: 'Architectural',
  name: '',
  floor: 'All',
  description: '',
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ status, type = 'set' }: { status: string; type?: 'set' | 'row' | 'version' }) {
  if (type === 'set') {
    const cfg = SET_STATUS_CONFIG[status] ?? { label: status, color: 'text-[rgba(232,228,220,0.55)]', bg: 'bg-[rgba(255,255,255,0.06)]' };
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color} ${cfg.bg}`}>{cfg.label}</span>;
  }
  if (type === 'row') {
    const cfg = ROW_STATUS_CONFIG[status] ?? { label: status, dot: 'bg-[rgba(255,255,255,0.25)]' };
    return (
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        <span className="text-xs text-[rgba(232,228,220,0.7)]">{cfg.label}</span>
      </span>
    );
  }
  const colors: Record<string, string> = { PENDING: 'text-[#c4a35a]', APPROVED: 'text-[#6ee7b7]', REJECTED: 'text-[#e06050]' };
  return <span className={`text-xs font-medium ${colors[status] ?? 'text-[rgba(232,228,220,0.55)]'}`}>{status}</span>;
}

// Tri-state checkbox (checked / indeterminate / unchecked)
function Checkbox({ checked, indeterminate, onChange, size = 'md' }: {
  checked: boolean; indeterminate?: boolean; onChange: () => void; size?: 'sm' | 'md';
}) {
  const s = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`${s} rounded border flex items-center justify-center shrink-0 transition-all ${
        checked || indeterminate
          ? 'bg-[#c4a35a] border-[#c4a35a]'
          : 'border-[rgba(255,255,255,0.2)] hover:border-[rgba(255,255,255,0.4)] bg-transparent'
      }`}>
      {checked && <Check className="w-2.5 h-2.5 text-[#0e1016] stroke-[3]" />}
      {!checked && indeterminate && <Minus className="w-2.5 h-2.5 text-[#0e1016] stroke-[3]" />}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { project, isLoading: projectLoading } = useProject();
  const myRole = project?.myRole ?? '';
  const projectName = project?.name ?? '';

  const tabs = (() => {
    if (myRole === 'CONSULTANT') return ['Overview', 'My Sets', 'All Drawings', 'Import'];
    if (myRole === 'PMC')       return ['Overview', 'Drawing Sets', 'Review Queue'];
    if (myRole === 'CLIENT')     return ['Overview', 'Drawing Sets', 'All Drawings'];
    if (myRole === 'VENDOR')    return ['Approved Drawings'];
    return ['Overview', 'Drawing Sets', 'All Drawings'];
  })();

  const [activeTab, setActiveTab] = useState(tabs[0]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: stats, mutate: refetchStats } =
    useSWR<OverviewStats>(projectId ? `/api/projects/${projectId}/architecture` : null, jsonFetcher);
  const { data: rawSets, error: setsError, mutate: refetchSets } =
    useSWR<DrawingSet[]>(projectId ? `/api/projects/${projectId}/architecture/sets` : null, jsonFetcher);
  const { data: rawRows, error: rowsError, isLoading: rowsLoading, mutate: refetchRows } =
    useSWR<DrawingRow[]>(projectId ? `/api/projects/${projectId}/architecture/rows` : null, jsonFetcher);

  const sets: DrawingSet[] = rawSets ?? [];
  const rows: DrawingRow[] = rawRows ?? [];

  // ── Multi-select & bulk assign state ──────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSetId, setBulkSetId] = useState<string>(''); // '' = unassign, id = assign
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccess, setBulkSuccess] = useState('');
  const [showBulkPicker, setShowBulkPicker] = useState(false);
  // Inline create inside bulk picker
  const [bulkCreateMode, setBulkCreateMode] = useState(false);
  const [bulkNewSet, setBulkNewSet] = useState({ name: '', cost: '', currency: 'INR' });
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkCreateError, setBulkCreateError] = useState('');

  // ── Filter state for drawings table ──────────────────────────────────────
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFloor, setFilterFloor] = useState('');
  const [filterSet, setFilterSet] = useState('');
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // ── Derived filtered rows ─────────────────────────────────────────────────
  const displayRows = useMemo(() => {
    const isVendor = myRole === 'VENDOR';
    return rows.filter((r) => {
      if (isVendor && r.status !== 'APPROVED') return false;
      if (filterCategory && r.category !== filterCategory) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterFloor && r.floor !== filterFloor) return false;
      if (filterSet === '__none__' && r.set) return false;
      if (filterSet && filterSet !== '__none__' && r.set?.id !== filterSet) return false;
      return true;
    });
  }, [rows, myRole, filterCategory, filterStatus, filterFloor, filterSet]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);
  const floors = useMemo(() => Array.from(new Set(rows.map((r) => r.floor))), [rows]);
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status))), [rows]);

  const groupedRows = useMemo(() => {
    if (!groupByCategory) return null;
    const map = new Map<string, DrawingRow[]>();
    for (const r of displayRows) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return map;
  }, [groupByCategory, displayRows]);

  // Selection helpers
  const visibleIds = useMemo(() => new Set(displayRows.map((r) => r.id)), [displayRows]);
  const selectedVisible = useMemo(() => new Set(Array.from(selectedIds).filter((id) => visibleIds.has(id))), [selectedIds, visibleIds]);
  const allVisibleSelected = visibleIds.size > 0 && selectedVisible.size === visibleIds.size;
  const someVisibleSelected = selectedVisible.size > 0 && !allVisibleSelected;

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => { const n = new Set(prev); visibleIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelectedIds((prev) => new Set([...Array.from(prev), ...Array.from(visibleIds)]));
    }
  };

  const toggleCategory = (cat: string, catRows: DrawingRow[]) => {
    const catIds = new Set(catRows.map((r) => r.id));
    const allSelected = catRows.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const n = new Set(prev);
      catIds.forEach((id) => allSelected ? n.delete(id) : n.add(id));
      return n;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Bulk assign ───────────────────────────────────────────────────────────
  const handleBulkAssign = async (targetSetId: string | null) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkAssigning(true); setBulkError(''); setBulkSuccess('');
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/rows/bulk`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: ids, setId: targetSetId }),
      });
      const data = await res.json();
      if (data.success) {
        const targetName = targetSetId ? sets.find((s) => s.id === targetSetId)?.name : null;
        setBulkSuccess(
          `${data.data.updated} drawing${data.data.updated !== 1 ? 's' : ''} ${targetName ? `assigned to "${targetName}"` : 'unassigned'}.`
          + (data.data.skipped > 0 ? ` ${data.data.skipped} skipped.` : '')
        );
        clearSelection();
        setShowBulkPicker(false);
        void refetchRows(); void refetchSets(); void refetchStats();
        setTimeout(() => setBulkSuccess(''), 4000);
      } else {
        setBulkError(data.error ?? 'Bulk assign failed');
      }
    } catch { setBulkError('Request failed'); }
    finally { setBulkAssigning(false); }
  };

  const handleBulkCreateAndAssign = async () => {
    if (!bulkNewSet.name.trim()) return;
    setBulkCreating(true); setBulkCreateError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/sets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: bulkNewSet.name, cost: parseFloat(bulkNewSet.cost) || 0, currency: bulkNewSet.currency }),
      });
      const data = await res.json();
      if (!data.success) { setBulkCreateError(data.error ?? 'Create failed'); return; }
      await refetchSets();
      await handleBulkAssign(data.data.id as string);
      setBulkCreateMode(false);
      setBulkNewSet({ name: '', cost: '', currency: 'INR' });
    } catch { setBulkCreateError('Create failed'); }
    finally { setBulkCreating(false); }
  };

  // ── Create Set modal ──────────────────────────────────────────────────────
  const [showCreateSet, setShowCreateSet] = useState(false);
  const [newSet, setNewSet] = useState({ name: '', description: '', cost: '', currency: 'INR' });
  const [newSetDrawings, setNewSetDrawings] = useState<ManualDrawingDraft[]>([createBlankDrawing()]);
  const [creatingSet, setCreatingSet] = useState(false);
  const [createSetError, setCreateSetError] = useState('');
  const [justCreatedSetId, setJustCreatedSetId] = useState<string | null>(null);

  const updateNewSetDrawing = (index: number, patch: Partial<ManualDrawingDraft>) => {
    setNewSetDrawings((prev) => prev.map((drawing, i) => i === index ? { ...drawing, ...patch } : drawing));
  };

  const manualDrawingsEndRef = useRef<HTMLDivElement>(null);

  const addNewSetDrawing = () => {
    setNewSetDrawings((prev) => [...prev, createBlankDrawing()]);
    setTimeout(() => manualDrawingsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  const removeNewSetDrawing = (index: number) => {
    setNewSetDrawings((prev) => prev.length === 1 ? [createBlankDrawing()] : prev.filter((_, i) => i !== index));
  };

  const resetCreateSetForm = () => {
    setNewSet({ name: '', description: '', cost: '', currency: 'INR' });
    setNewSetDrawings([createBlankDrawing()]);
    setCreateSetError('');
  };

  const handleCreateSet = async () => {
    setCreatingSet(true); setCreateSetError('');
    try {
      const drawingsToCreate = newSetDrawings
        .map((drawing) => ({
          category: drawing.category.trim(),
          name: drawing.name.trim(),
          floor: drawing.floor,
          description: drawing.description.trim(),
        }))
        .filter((drawing) => drawing.name || drawing.category || drawing.description)
        .filter((drawing) => drawing.name && drawing.category);

      const res = await fetch(`/api/projects/${projectId}/architecture/sets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSet.name, description: newSet.description, cost: parseFloat(newSet.cost) || 0, currency: newSet.currency }),
      });
      const data = await res.json();
      if (!data.success) { setCreateSetError(data.error); return; }

      const createdSetId = data.data.id as string;
      for (const drawing of drawingsToCreate) {
        const rowRes = await fetch(`/api/projects/${projectId}/architecture/rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: drawing.category,
            name: drawing.name,
            floor: drawing.floor,
            description: drawing.description || undefined,
            setId: createdSetId,
          }),
        });
        const rowData = await rowRes.json();
        if (!rowData.success) {
          setCreateSetError(`Set was created, but a drawing could not be added: ${rowData.error ?? 'Invalid drawing'}`);
          return;
        }
      }

      setShowCreateSet(false);
      resetCreateSetForm();
      setJustCreatedSetId(createdSetId);
      setTimeout(() => setJustCreatedSetId(null), 5000);
      void refetchSets(); void refetchRows(); void refetchStats();
    } catch { setCreateSetError('Failed to create set'); }
    finally { setCreatingSet(false); }
  };

  // ── Import Excel ──────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<Array<{ category: string; name: string; floor: string; description?: string }>>([]);
  const [importParseError, setImportParseError] = useState('');
  const [importParseNote, setImportParseNote] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'skip' | 'append'>('skip');
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; duplicates: number; message?: string } | null>(null);

  const handleImportFile = async (file: File) => {
    setImportParseError(''); setImportParseNote(''); setImportRows([]); setImportResult(null); setImportMode('skip');
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', blankrows: false }) as (string | number)[][];
      const parsed: typeof importRows = [];
      const skipped: number[] = [];
      for (let i = 1; i < raw.length; i++) {
        const r = raw[i];
        const category = String(r[1] ?? '').trim();
        const name = String(r[2] ?? '').trim();
        const floor = String(r[3] ?? '').trim() || 'All';
        const description = String(r[4] ?? '').trim() || undefined;
        if (!category && !name) continue;
        if (!category || !name) { skipped.push(i + 1); continue; }
        parsed.push({ category, name, floor, description });
      }
      if (parsed.length === 0) { setImportParseError('No valid rows found.'); return; }
      if (skipped.length > 0) setImportParseNote(`${parsed.length} rows loaded. ${skipped.length} skipped.`);
      setImportRows(parsed);
    } catch { setImportParseError('Could not read the file.'); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleImport = async (mode: 'skip' | 'append' = importMode) => {
    setImporting(true); setImportParseError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/rows/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importRows, mode }),
      });
      const data = await res.json();
      if (data.success) { setImportResult(data.data); void refetchRows(); void refetchStats(); }
      else setImportParseError(data.error ?? 'Import failed');
    } catch { setImportParseError('Import failed.'); }
    finally { setImporting(false); }
  };

  // ── Upload version modal ──────────────────────────────────────────────────
  const [uploadModal, setUploadModal] = useState<{
    rowId: string; rowName: string; setName?: string; setStatus?: string; currentVersionNo?: number;
  } | null>(null);
  const [uploadType, setUploadType] = useState<'PDF' | 'URL'>('PDF');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const openUploadModal = (row: DrawingRow) => {
    setUploadModal({ rowId: row.id, rowName: row.name, setName: row.set?.name, setStatus: row.set?.status, currentVersionNo: row.versions[0]?.versionNumber });
    setUploadType('PDF'); setUploadFile(null); setUploadUrl(''); setUploadFileName(''); setUploadError('');
  };

  const handleUpload = async () => {
    if (!uploadModal) return;
    setUploading(true); setUploadError('');
    try {
      let res: Response;
      if (uploadType === 'PDF') {
        if (!uploadFile) { setUploadError('Select a PDF file'); setUploading(false); return; }
        const fd = new FormData(); fd.append('file', uploadFile);
        res = await fetch(`/api/projects/${projectId}/architecture/rows/${uploadModal.rowId}/versions`, { method: 'POST', body: fd });
      } else {
        if (!uploadUrl.trim()) { setUploadError('Enter a URL'); setUploading(false); return; }
        res = await fetch(`/api/projects/${projectId}/architecture/rows/${uploadModal.rowId}/versions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: uploadUrl.trim(), fileName: uploadFileName.trim() || undefined }),
        });
      }
      const data = await res.json();
      if (data.success) { setUploadModal(null); void refetchRows(); void refetchSets(); void refetchStats(); }
      else setUploadError(data.error);
    } catch { setUploadError('Upload failed'); }
    finally { setUploading(false); }
  };

  const drawingFileHref = (versionId: string, download = false) =>
    `/api/projects/${projectId}/architecture/drawing-files/${versionId}${download ? '?download=1' : ''}`;

  // ── Review modal ──────────────────────────────────────────────────────────
  const [reviewModal, setReviewModal] = useState<{ rowId: string; versionId: string; rowName: string } | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const handleReview = async () => {
    if (!reviewModal) return;
    if (reviewAction === 'REJECT' && !reviewReason.trim()) { setReviewError('Reason required'); return; }
    setReviewing(true); setReviewError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/rows/${reviewModal.rowId}/versions/${reviewModal.versionId}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: reviewAction, rejectionReason: reviewReason.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) { setReviewModal(null); setReviewReason(''); void refetchRows(); void refetchSets(); void refetchStats(); }
      else setReviewError(data.error);
    } catch { setReviewError('Review failed'); }
    finally { setReviewing(false); }
  };

  // ── Set actions ───────────────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [requestModal, setRequestModal] = useState<{ setId: string; setName: string } | null>(null);
  const [requestForm, setRequestForm] = useState({ dueDate: '', note: '' });
  const [requestError, setRequestError] = useState('');

  const doSetAction = useCallback(async (setId: string, endpoint: string, body?: Record<string, unknown>) => {
    setActionLoading(setId);
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/sets/${setId}/${endpoint}`, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      if (data.success) { void refetchSets(); void refetchRows(); void refetchStats(); }
      else alert(data.error);
    } catch { alert('Action failed'); }
    finally { setActionLoading(null); }
  }, [projectId, refetchRows, refetchSets, refetchStats]);

  const handleDeleteSet = useCallback(async (setId: string, setName: string) => {
    if (!confirm(`Delete set "${setName}"? This cannot be undone.`)) return;
    setActionLoading(setId);
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/sets/${setId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { void refetchSets(); void refetchRows(); void refetchStats(); }
      else alert(data.error);
    } catch { alert('Delete failed'); }
    finally { setActionLoading(null); }
  }, [projectId, refetchRows, refetchSets, refetchStats]);

  const openRequestModal = (set: DrawingSet) => {
    setRequestModal({ setId: set.id, setName: set.name });
    setRequestForm({
      dueDate: set.dueDate ? new Date(set.dueDate).toISOString().slice(0, 10) : '',
      note: '',
    });
    setRequestError('');
  };

  const handleRequestSet = async () => {
    if (!requestModal) return;
    if (!requestForm.dueDate) { setRequestError('Due date is required'); return; }
    setActionLoading(requestModal.setId);
    setRequestError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/sets/${requestModal.setId}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dueDate: requestForm.dueDate,
          note: requestForm.note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRequestModal(null);
        void refetchSets(); void refetchRows(); void refetchStats();
      } else {
        setRequestError(data.error ?? 'Request failed');
      }
    } catch {
      setRequestError('Request failed');
    } finally {
      setActionLoading(null);
    }
  };

  const openRequestedSetDrawings = (setId: string) => {
    setFilterSet(setId);
    setFilterCategory('');
    setFilterFloor('');
    setFilterStatus('');
    setActiveTab('All Drawings');
  };

  // ── Version history modal ─────────────────────────────────────────────────
  const [historyModal, setHistoryModal] = useState<{ rowId: string; rowName: string } | null>(null);
  const { data: versionHistory } = useSWR<DrawingVersion[]>(
    historyModal ? `/api/projects/${projectId}/architecture/rows/${historyModal.rowId}/versions` : null,
    jsonFetcher,
  );

  // ── Single-row assign modal ───────────────────────────────────────────────
  const [assignModal, setAssignModal] = useState<{ rowId: string; rowName: string; currentSetId?: string } | null>(null);
  const [assignSetId, setAssignSetId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignCreateMode, setAssignCreateMode] = useState(false);
  const [assignNewSet, setAssignNewSet] = useState({ name: '', cost: '', currency: 'INR' });
  const [assignCreating, setAssignCreating] = useState(false);
  const [assignCreateError, setAssignCreateError] = useState('');

  const openAssignModal = (row: DrawingRow) => {
    setAssignModal({ rowId: row.id, rowName: row.name, currentSetId: row.set?.id });
    setAssignSetId(row.set?.id ?? ''); setAssignError('');
    setAssignCreateMode(false); setAssignNewSet({ name: '', cost: '', currency: 'INR' }); setAssignCreateError('');
  };

  const handleAssignCreateAndAssign = async () => {
    if (!assignModal || !assignNewSet.name.trim()) return;
    setAssignCreating(true); setAssignCreateError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/sets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: assignNewSet.name, cost: parseFloat(assignNewSet.cost) || 0, currency: assignNewSet.currency }),
      });
      const data = await res.json();
      if (!data.success) { setAssignCreateError(data.error ?? 'Create failed'); return; }
      await refetchSets();
      const res2 = await fetch(`/api/projects/${projectId}/architecture/rows/${assignModal.rowId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId: data.data?.id }),
      });
      const data2 = await res2.json();
      if (data2.success) { setAssignModal(null); void refetchRows(); void refetchSets(); void refetchStats(); }
      else setAssignError(data2.error);
    } catch { setAssignCreateError('Create failed'); }
    finally { setAssignCreating(false); }
  };

  const handleAssign = async () => {
    if (!assignModal) return;
    setAssigning(true); setAssignError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/rows/${assignModal.rowId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId: assignSetId || null }),
      });
      const data = await res.json();
      if (data.success) { setAssignModal(null); void refetchRows(); void refetchSets(); void refetchStats(); }
      else setAssignError(data.error);
    } catch { setAssignError('Failed to assign'); }
    finally { setAssigning(false); }
  };

  if (projectLoading) return <Layout><TablePageSkeleton /></Layout>;

  const statsData = stats as OverviewStats | undefined;
  const canBulkAssign = myRole === 'CONSULTANT';

  // ── Renders ───────────────────────────────────────────────────────────────

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Drawings', value: statsData?.rows.total ?? 0, icon: <FileText className="w-5 h-5" />, color: 'text-[#c4a35a]' },
          { label: 'Pending Upload',  value: statsData?.rows.pending ?? 0,    icon: <Clock className="w-5 h-5" />,        color: 'text-[rgba(232,228,220,0.55)]' },
          { label: 'Approved',        value: statsData?.rows.approved ?? 0,   icon: <CheckCircle2 className="w-5 h-5" />, color: 'text-[#6ee7b7]' },
          { label: 'Pending Review',  value: statsData?.pendingReview ?? 0,   icon: <AlertCircle className="w-5 h-5" />,  color: 'text-[#fb923c]' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className={`${s.color} mb-2`}>{s.icon}</div>
            <div className="text-2xl font-bold text-[#e8e4dc]">{s.value}</div>
            <div className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header"><h2 className="font-semibold">Drawing Sets Summary</h2></div>
        <div className="card-body">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-[#e8e4dc]">{statsData?.sets.total ?? 0}</div>
              <div className="text-xs text-[rgba(232,228,220,0.45)]">Total Sets</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#6ee7b7]">{statsData?.sets.approved ?? 0}</div>
              <div className="text-xs text-[rgba(232,228,220,0.45)]">Approved</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#a78bfa]">{statsData?.sets.paid ?? 0}</div>
              <div className="text-xs text-[rgba(232,228,220,0.45)]">Paid</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSetCard = (set: DrawingSet) => {
    const pct = set.rowStats.total > 0 ? Math.round((set.rowStats.approved / set.rowStats.total) * 100) : 0;
    const isLoading = actionLoading === set.id;
    const isRequested = set.status === 'REQUESTED';
    const isJustCreated = justCreatedSetId === set.id;
    const canOpenSetRows = ['CONSULTANT', 'PMC', 'CLIENT'].includes(myRole);
    return (
      <div
        key={set.id}
        onClick={() => { if (canOpenSetRows) openRequestedSetDrawings(set.id); }}
        className={`card transition-all ${isJustCreated ? 'ring-2 ring-[rgba(196,163,90,0.5)] shadow-[0_0_24px_rgba(196,163,90,0.12)]' : ''} ${isRequested && myRole === 'CONSULTANT' ? 'ring-1 ring-[rgba(129,140,248,0.35)]' : ''} ${canOpenSetRows ? 'cursor-pointer hover:border-[rgba(196,163,90,0.25)]' : ''}`}
      >
        <div className="card-body space-y-3">
          {isRequested && myRole === 'CONSULTANT' && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[rgba(129,140,248,0.08)] border border-[rgba(129,140,248,0.2)]">
              <Zap className="w-4 h-4 text-[#818cf8] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[#818cf8]">PMC has requested this set</p>
                <p className="text-xs text-[rgba(232,228,220,0.5)] mt-0.5">Upload drawings for pending rows to progress this set.</p>
              </div>
            </div>
          )}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-[#e8e4dc]">{set.name}</h3>
                <StatusBadge status={set.status} type="set" />
                {isJustCreated && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(196,163,90,0.15)] text-[#c4a35a] border border-[rgba(196,163,90,0.3)] animate-pulse">New</span>
                )}
              </div>
              {set.description && <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5">{set.description}</p>}
            </div>
            <div className="text-right shrink-0">
              <div className="text-base font-bold text-[#c4a35a]">{formatCurrency(set.cost)}</div>
              <div className="text-xs text-[rgba(232,228,220,0.35)]">{set.currency}</div>
            </div>
          </div>
          {set.rowStats.total > 0 && (
            <div>
              <div className="flex justify-between text-xs text-[rgba(232,228,220,0.45)] mb-1">
                <span>{set.rowStats.approved}/{set.rowStats.total} approved</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                <div className="h-full bg-[#6ee7b7] rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex gap-3 mt-1.5 flex-wrap">
                {set.rowStats.pending   > 0 && <span className="text-xs text-[rgba(232,228,220,0.45)]">{set.rowStats.pending} pending</span>}
                {set.rowStats.submitted > 0 && <span className="text-xs text-[#c4a35a]">{set.rowStats.submitted} to review</span>}
                {set.rowStats.rejected  > 0 && <span className="text-xs text-[#e06050]">{set.rowStats.rejected} rejected</span>}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgba(232,228,220,0.35)]">
            <span>By {set.createdByName}</span>
            {set.requestedByName && <span>Requested by {set.requestedByName}</span>}
            {set.dueDate && <span className="text-[#818cf8] flex items-center gap-1"><Calendar className="w-3 h-3" />Due {formatDate(set.dueDate)}</span>}
            {set.approvedAt && <span>Approved {formatDate(set.approvedAt)}</span>}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {myRole === 'CONSULTANT' && set.status === 'DRAFT' && (
              <button onClick={(e) => { e.stopPropagation(); void doSetAction(set.id, 'submit'); }} disabled={isLoading}
                className="btn btn-sm btn-primary disabled:opacity-50">{isLoading ? '…' : 'Submit to PMC →'}</button>
            )}
            {myRole === 'PMC' && set.status === 'SUBMITTED_TO_PMC' && (
              <button onClick={(e) => { e.stopPropagation(); openRequestModal(set); }} disabled={isLoading}
                className="btn btn-sm btn-primary disabled:opacity-50">{isLoading ? '…' : 'Request This Set'}</button>
            )}
            {myRole === 'PMC' && set.status === 'DELIVERED' && (
              <button onClick={(e) => { e.stopPropagation(); void doSetAction(set.id, 'approve'); }} disabled={isLoading}
                className="btn btn-sm btn-success disabled:opacity-50">{isLoading ? '…' : 'Approve Set ✓'}</button>
            )}
            {myRole === 'CLIENT' && set.status === 'APPROVED' && (
              <button onClick={(e) => { e.stopPropagation(); void doSetAction(set.id, 'payment'); }} disabled={isLoading}
                className="btn btn-sm bg-[rgba(167,139,250,0.15)] text-[#a78bfa] border border-[rgba(167,139,250,0.3)] hover:bg-[rgba(167,139,250,0.25)] disabled:opacity-50">
                {isLoading ? '…' : `Release ₹${set.cost.toLocaleString('en-IN')}`}
              </button>
            )}
            {myRole === 'CONSULTANT' && isRequested && (
              <button onClick={(e) => { e.stopPropagation(); openRequestedSetDrawings(set.id); }}
                className="btn btn-sm border border-[rgba(129,140,248,0.3)] text-[#818cf8] hover:bg-[rgba(129,140,248,0.08)] flex items-center gap-1.5">
                <Upload className="w-3 h-3" />Upload Drawings
              </button>
            )}
            {myRole === 'CONSULTANT' && set.status === 'DRAFT' && (
              <button onClick={(e) => { e.stopPropagation(); void handleDeleteSet(set.id, set.name); }} disabled={isLoading}
                className="btn btn-sm border border-[rgba(224,96,80,0.25)] text-[#e06050] hover:bg-[rgba(224,96,80,0.08)] flex items-center gap-1.5 disabled:opacity-50 ml-auto">
                <Trash2 className="w-3 h-3" />Delete Set
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── All Drawings: filter bar + grouped/flat table ─────────────────────────

  const renderFilterBar = () => {
    const hasFilters = filterCategory || filterStatus || filterFloor || filterSet;
    return (
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-[rgba(255,255,255,0.06)]">
        {/* Category pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-[rgba(232,228,220,0.3)] flex items-center gap-1"><Tag className="w-3 h-3" />Category</span>
          {categories.map((cat) => (
            <button key={cat} onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                filterCategory === cat
                  ? 'bg-[rgba(196,163,90,0.15)] border-[rgba(196,163,90,0.4)] text-[#c4a35a]'
                  : 'border-[rgba(255,255,255,0.08)] text-[rgba(232,228,220,0.45)] hover:border-[rgba(255,255,255,0.15)] hover:text-[rgba(232,228,220,0.7)]'
              }`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-[rgba(255,255,255,0.07)] mx-1" />

        {/* Status filter */}
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg px-2.5 py-1 text-[rgba(232,228,220,0.55)] focus:outline-none hover:border-[rgba(255,255,255,0.15)]">
          <option value="">All Status</option>
          {statuses.map((s) => <option key={s} value={s}>{ROW_STATUS_CONFIG[s]?.label ?? s}</option>)}
        </select>

        {/* Floor filter */}
        <select value={filterFloor} onChange={(e) => setFilterFloor(e.target.value)}
          className="text-xs bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg px-2.5 py-1 text-[rgba(232,228,220,0.55)] focus:outline-none hover:border-[rgba(255,255,255,0.15)]">
          <option value="">All Floors</option>
          {floors.map((f) => <option key={f} value={f}>{FLOOR_LABELS[f] ?? f}</option>)}
        </select>

        {/* Set filter */}
        <select value={filterSet} onChange={(e) => setFilterSet(e.target.value)}
          className="text-xs bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg px-2.5 py-1 text-[rgba(232,228,220,0.55)] focus:outline-none hover:border-[rgba(255,255,255,0.15)]">
          <option value="">All Sets</option>
          <option value="__none__">Unassigned</option>
          {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Clear filters */}
        {hasFilters && (
          <button onClick={() => { setFilterCategory(''); setFilterStatus(''); setFilterFloor(''); setFilterSet(''); }}
            className="text-xs text-[rgba(232,228,220,0.35)] hover:text-[#e8e4dc] flex items-center gap-1 transition-colors">
            <X className="w-3 h-3" />Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Group toggle */}
          <button onClick={() => setGroupByCategory(!groupByCategory)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all ${
              groupByCategory
                ? 'bg-[rgba(129,140,248,0.1)] border-[rgba(129,140,248,0.3)] text-[#818cf8]'
                : 'border-[rgba(255,255,255,0.08)] text-[rgba(232,228,220,0.45)] hover:border-[rgba(255,255,255,0.15)]'
            }`}>
            <LayoutGrid className="w-3 h-3" />Group
          </button>

          {/* Template download */}
          {['PMC', 'CONSULTANT'].includes(myRole) && (
            <a href={`/api/projects/${projectId}/architecture/rows/template`} download
              className="flex items-center gap-1.5 text-xs text-[rgba(232,228,220,0.4)] hover:text-[#c4a35a] transition-colors">
              <Download className="w-3 h-3" />Template
            </a>
          )}
        </div>
      </div>
    );
  };

  const renderRowCells = (row: DrawingRow) => {
    const currentVersion = row.versions[0];
    const canUpload = myRole === 'CONSULTANT' && row.status !== 'APPROVED';
    const canReview = ['PMC', 'CLIENT'].includes(myRole) && currentVersion?.reviewStatus === 'PENDING';
    const canViewHistory = ['CLIENT', 'PMC', 'CONSULTANT'].includes(myRole);
    const isVendor = myRole === 'VENDOR';
    const setRequested = row.set?.status === 'REQUESTED';
    const isSelected = selectedIds.has(row.id);

    return (
      <tr key={row.id}
        onClick={() => canBulkAssign && toggleRow(row.id)}
        className={`border-b border-[rgba(255,255,255,0.04)] last:border-0 transition-colors ${
          isSelected
            ? 'bg-[rgba(196,163,90,0.06)]'
            : setRequested && myRole === 'CONSULTANT' && row.status === 'PENDING'
              ? 'bg-[rgba(129,140,248,0.02)] hover:bg-[rgba(129,140,248,0.04)]'
              : 'hover:bg-[rgba(255,255,255,0.015)]'
        } ${canBulkAssign ? 'cursor-pointer' : ''}`}>
        {/* Checkbox */}
        {canBulkAssign && (
          <td className="px-3 py-3 w-8">
            <Checkbox checked={isSelected} onChange={() => toggleRow(row.id)} size="sm" />
          </td>
        )}
        <td className="px-2 py-3 text-xs text-[rgba(232,228,220,0.35)] w-10">{row.serialNo}</td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <div className="text-sm text-[#e8e4dc] font-medium leading-snug">{row.name}</div>
              <div className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">{row.category}</div>
            </div>
            {setRequested && myRole === 'CONSULTANT' && row.status === 'PENDING' && (
              <span className="flex items-center gap-1 text-xs text-[#818cf8] bg-[rgba(129,140,248,0.1)] px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#818cf8] animate-pulse" />needed
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-xs text-[rgba(232,228,220,0.55)]">{FLOOR_LABELS[row.floor] ?? row.floor}</td>
        <td className="px-3 py-3">
          {row.set
            ? <span className="text-xs text-[rgba(232,228,220,0.55)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 rounded">{row.set.name}</span>
            : <span className="text-xs text-[rgba(232,228,220,0.2)]">—</span>}
        </td>
        <td className="px-3 py-3"><StatusBadge status={row.status} type="row" /></td>
        <td className="px-3 py-3">
          {currentVersion ? (
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={currentVersion.reviewStatus} type="version" />
              <span className="text-xs text-[rgba(232,228,220,0.35)]">v{currentVersion.versionNumber}</span>
              {currentVersion.uploadType === 'URL'
                ? <a href={currentVersion.fileUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-[#c4a35a] hover:underline flex items-center gap-1"><LinkIcon className="w-3 h-3" />View</a>
                : (
                  <>
                    <a href={drawingFileHref(currentVersion.id)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-[#c4a35a] hover:underline flex items-center gap-1"><Eye className="w-3 h-3" />View</a>
                    <a href={drawingFileHref(currentVersion.id, true)} onClick={(e) => e.stopPropagation()} className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[#c4a35a] flex items-center gap-1"><Download className="w-3 h-3" />Download</a>
                  </>
                )}
            </div>
          ) : <span className="text-xs text-[rgba(232,228,220,0.2)]">No file</span>}
        </td>
        {!isVendor && (
          <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end gap-2">
              {canUpload && (
                <button onClick={() => openUploadModal(row)}
                  className={`text-xs flex items-center gap-1 transition-colors ${setRequested && row.status === 'PENDING' ? 'text-[#818cf8] hover:text-[#a5b4fc] font-medium' : 'text-[rgba(232,228,220,0.45)] hover:text-[#c4a35a]'}`}>
                  <Upload className="w-3 h-3" />{currentVersion ? 'Rev' : 'Upload'}
                </button>
              )}
              {canReview && (
                <button onClick={() => setReviewModal({ rowId: row.id, versionId: currentVersion!.id, rowName: row.name })}
                  className="text-xs text-[#fb923c] hover:text-[#f97316] font-medium transition-colors">Review</button>
              )}
              {myRole === 'CONSULTANT' && (
                <button onClick={() => openAssignModal(row)}
                  className="text-xs text-[rgba(232,228,220,0.4)] hover:text-[#818cf8] transition-colors">
                  {row.set ? 'Move' : 'Set'}
                </button>
              )}
              {canViewHistory && (
                <button onClick={() => setHistoryModal({ rowId: row.id, rowName: row.name })}
                  className="text-xs text-[rgba(232,228,220,0.3)] hover:text-[rgba(232,228,220,0.65)] transition-colors">
                  <History className="w-3 h-3" />
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
    );
  };

  const tableHead = (isVendor: boolean) => (
    <thead>
      <tr className="border-b border-[rgba(255,255,255,0.07)]">
        {canBulkAssign && (
          <th className="px-3 py-3 w-8">
            <Checkbox
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              onChange={toggleAllVisible}
              size="sm"
            />
          </th>
        )}
        <th className="px-2 py-3 text-left text-xs text-[rgba(232,228,220,0.35)] font-medium w-10">#</th>
        <th className="px-3 py-3 text-left text-xs text-[rgba(232,228,220,0.35)] font-medium">Drawing</th>
        <th className="px-3 py-3 text-left text-xs text-[rgba(232,228,220,0.35)] font-medium">Floor</th>
        <th className="px-3 py-3 text-left text-xs text-[rgba(232,228,220,0.35)] font-medium">Set</th>
        <th className="px-3 py-3 text-left text-xs text-[rgba(232,228,220,0.35)] font-medium">Status</th>
        <th className="px-3 py-3 text-left text-xs text-[rgba(232,228,220,0.35)] font-medium">Latest Version</th>
        {!isVendor && <th className="px-4 py-3 text-right text-xs text-[rgba(232,228,220,0.35)] font-medium">Actions</th>}
      </tr>
    </thead>
  );

  const renderAllDrawings = () => {
    const isVendor = myRole === 'VENDOR';

    // ── Error state: API returned 500 (Prisma not ready / server error) ────
    if (rowsError) {
      return (
        <div className="card p-8 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-[#e06050] mx-auto" />
          <p className="text-sm font-medium text-[#e06050]">Could not load drawings</p>
          <p className="text-xs text-[rgba(232,228,220,0.4)] max-w-xs mx-auto">
            {String(rowsError?.message ?? 'Server error')}
          </p>
          <button onClick={() => void refetchRows()} className="btn btn-secondary btn-sm mx-auto">
            Retry
          </button>
        </div>
      );
    }

    // ── Loading skeleton ───────────────────────────────────────────────────
    if (rowsLoading) {
      return (
        <div className="card">
          <div className="card-header"><div className="h-4 w-32 bg-[rgba(255,255,255,0.07)] rounded animate-pulse" /></div>
          <div className="card-body space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="card space-y-0 overflow-hidden">
        <div className="card-header pb-0">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">
              {isVendor ? 'Approved Drawings' : `All Drawings`}
              <span className="ml-2 text-sm font-normal text-[rgba(232,228,220,0.4)]">({displayRows.length}{displayRows.length !== rows.length ? ` of ${rows.length}` : ''})</span>
            </h2>
          </div>
          {!isVendor && renderFilterBar()}
        </div>

        <div className="overflow-x-auto">
          {groupByCategory && groupedRows ? (
            /* ── Grouped by category ── */
            <table className="w-full text-sm">
              {tableHead(isVendor)}
              <tbody>
                {Array.from(groupedRows.entries()).map(([cat, catRows]) => {
                  const collapsed = collapsedCategories.has(cat);
                  const catIds = catRows.map((r: DrawingRow) => r.id);
                  const allCatSelected = catIds.every((id: string) => selectedIds.has(id));
                  const someCatSelected = catIds.some((id: string) => selectedIds.has(id)) && !allCatSelected;

                  return (
                    <>
                      {/* Category header row */}
                      <tr key={`cat-${cat}`}
                        className="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)] cursor-pointer select-none"
                        onClick={() => setCollapsedCategories((prev) => {
                          const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n;
                        })}>
                        {canBulkAssign && (
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={allCatSelected}
                              indeterminate={someCatSelected}
                              onChange={() => toggleCategory(cat, catRows)}
                              size="sm"
                            />
                          </td>
                        )}
                        <td colSpan={canBulkAssign ? 7 : 8} className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {collapsed
                              ? <ChevronRightIcon className="w-3.5 h-3.5 text-[rgba(232,228,220,0.4)]" />
                              : <ChevronDown className="w-3.5 h-3.5 text-[rgba(232,228,220,0.4)]" />}
                            <span className="text-xs font-semibold text-[rgba(232,228,220,0.7)] uppercase tracking-wider">{cat}</span>
                            <span className="text-xs text-[rgba(232,228,220,0.3)] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 rounded">{catRows.length}</span>
                            {canBulkAssign && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleCategory(cat, catRows); }}
                                className={`ml-2 text-xs px-2 py-0.5 rounded transition-all ${
                                  allCatSelected
                                    ? 'text-[#c4a35a] bg-[rgba(196,163,90,0.1)]'
                                    : 'text-[rgba(232,228,220,0.3)] hover:text-[rgba(232,228,220,0.6)] hover:bg-[rgba(255,255,255,0.04)]'
                                }`}>
                                {allCatSelected ? `✓ All selected` : `Select all ${catRows.length}`}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Category rows */}
                      {!collapsed && catRows.map((row: DrawingRow) => renderRowCells(row))}
                    </>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* ── Flat table ── */
            <table className="w-full text-sm">
              {tableHead(isVendor)}
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={canBulkAssign ? 9 : 8} className="px-4 py-12 text-center text-[rgba(232,228,220,0.35)] text-sm">
                    {isVendor ? 'No approved drawings yet' : 'No drawings match the current filters.'}
                  </td></tr>
                ) : displayRows.map((row) => renderRowCells(row))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  const renderReviewQueue = () => {
    const pending = rows.filter((r) => r.versions[0]?.reviewStatus === 'PENDING');
    return (
      <div className="space-y-4">
        {pending.length === 0 ? (
          <div className="card p-8 text-center text-[rgba(232,228,220,0.35)]">
            <CheckCircle2 className="w-8 h-8 text-[#6ee7b7] mx-auto mb-2" />
            All drawings reviewed — no pending items.
          </div>
        ) : (
          <div className="card">
            <div className="card-header"><h2 className="font-semibold">Pending Review ({pending.length})</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                {(() => {
                  const isVendor = false;
                  return tableHead(isVendor);
                })()}
                <tbody>{pending.map((row) => renderRowCells(row))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPayments = () => {
    const payableSets = sets.filter((s) => ['APPROVED', 'PAID'].includes(s.status));
    const totalApproved = sets.filter((s) => s.status === 'APPROVED').reduce((sum, s) => sum + s.cost, 0);
    const totalPaid = sets.filter((s) => s.status === 'PAID').reduce((sum, s) => sum + s.cost, 0);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="text-xs text-[rgba(232,228,220,0.45)] mb-1">Pending Payment</div>
            <div className="text-2xl font-bold text-[#fb923c]">₹{totalApproved.toLocaleString('en-IN')}</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-[rgba(232,228,220,0.45)] mb-1">Total Paid</div>
            <div className="text-2xl font-bold text-[#a78bfa]">₹{totalPaid.toLocaleString('en-IN')}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h2 className="font-semibold">Set Payments</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)]">
                  {['Set Name', 'Cost', 'Status', 'Approved', 'Paid By', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-[rgba(232,228,220,0.35)] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payableSets.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[rgba(232,228,220,0.35)]">No sets approved yet</td></tr>
                ) : payableSets.map((s) => (
                  <tr key={s.id} className="border-b border-[rgba(255,255,255,0.04)] last:border-0">
                    <td className="px-4 py-3 text-[#e8e4dc]">{s.name}</td>
                    <td className="px-4 py-3 font-medium text-[#c4a35a]">₹{s.cost.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} type="set" /></td>
                    <td className="px-4 py-3 text-[rgba(232,228,220,0.5)] text-xs">{s.approvedAt ? formatDate(s.approvedAt) : '—'}</td>
                    <td className="px-4 py-3 text-[rgba(232,228,220,0.5)] text-xs">{s.paymentReleaserName ?? '—'}</td>
                    <td className="px-4 py-3">
                      {s.status === 'APPROVED' ? (
                        <button onClick={() => doSetAction(s.id, 'payment')} disabled={actionLoading === s.id}
                          className="btn btn-sm bg-[rgba(167,139,250,0.15)] text-[#a78bfa] border border-[rgba(167,139,250,0.3)] hover:bg-[rgba(167,139,250,0.25)] disabled:opacity-50">
                          {actionLoading === s.id ? '…' : 'Release'}
                        </button>
                      ) : (
                        <span className="text-xs text-[rgba(232,228,220,0.3)]">Paid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderImportTab = () => (
    <div className="max-w-2xl space-y-5">
      {importResult ? (
        <div className="card p-6 space-y-4">
          {/* Result summary */}
          <div className={`p-4 rounded-lg border space-y-2 ${importResult.created > 0 ? 'bg-[rgba(92,186,128,0.07)] border-[rgba(92,186,128,0.2)]' : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)]'}`}>
            {importResult.created > 0 && (
              <p className="font-medium text-sm text-[#5cba80] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {importResult.created} drawing{importResult.created !== 1 ? 's' : ''} imported successfully
              </p>
            )}
            {importResult.duplicates > 0 && (
              <p className="text-sm text-[rgba(232,228,220,0.55)] flex items-center gap-2">
                <span className="w-4 h-4 text-center text-xs leading-4">⊘</span>
                {importResult.duplicates} already existed — skipped to avoid duplicates
              </p>
            )}
            {importResult.skipped > 0 && (
              <p className="text-sm text-[rgba(232,228,220,0.45)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {importResult.skipped} rows had missing data and were skipped
              </p>
            )}
            {importResult.message && importResult.created === 0 && (
              <p className="text-sm text-[rgba(232,228,220,0.6)]">{importResult.message}</p>
            )}
          </div>

          {/* If everything was duplicate, offer to import anyway */}
          {importResult.created === 0 && importResult.duplicates > 0 && importRows.length > 0 && (
            <div className="p-3 rounded-lg border border-[rgba(196,163,90,0.2)] bg-[rgba(196,163,90,0.05)]">
              <p className="text-xs text-[rgba(232,228,220,0.55)] mb-2">
                All rows already exist in the project. If you need to add them again (e.g. different floor versions), you can force-import.
              </p>
              <button onClick={() => void handleImport('append')} disabled={importing}
                className="btn btn-sm border border-[rgba(196,163,90,0.3)] text-[#c4a35a] hover:bg-[rgba(196,163,90,0.1)] disabled:opacity-50">
                {importing ? 'Importing…' : `Force import ${importRows.length} rows anyway`}
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => { setImportResult(null); setImportRows([]); }} className="btn btn-primary">Import More</button>
            <button onClick={() => setActiveTab(myRole === 'CONSULTANT' ? 'All Drawings' : tabs[0])} className="btn btn-secondary">View Drawings</button>
          </div>
        </div>
      ) : importRows.length > 0 ? (
        <div className="card p-6 space-y-4">
          {importParseNote && <p className="text-xs text-[#f97316] bg-[rgba(249,115,22,0.07)] border border-[rgba(249,115,22,0.2)] rounded-lg px-3 py-2">{importParseNote}</p>}
          <div className="flex items-center justify-between">
            <p className="text-sm text-[rgba(232,228,220,0.55)]">
              <span className="text-[#e8e4dc] font-medium">{importRows.length} drawings</span> ready to import
            </p>
            {/* Existing rows count hint */}
            {rows.length > 0 && (
              <span className="text-xs text-[rgba(232,228,220,0.35)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 rounded-lg">
                {rows.length} drawings already in project
              </span>
            )}
          </div>
          {/* Duplicate-skip notice */}
          {rows.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-xs text-[rgba(232,228,220,0.45)]">
              <Check className="w-3.5 h-3.5 text-[#6ee7b7] shrink-0 mt-0.5" />
              Duplicate rows (same category + name) will be automatically skipped — safe to re-import.
            </div>
          )}
          <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#13151a]">
                <tr className="border-b border-[rgba(255,255,255,0.06)]">
                  {['Category', 'Drawing Name', 'Floor'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[rgba(232,228,220,0.45)] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importRows.map((r, i) => (
                  <tr key={i} className="border-b border-[rgba(255,255,255,0.04)] last:border-0">
                    <td className="px-3 py-2 text-[rgba(232,228,220,0.6)]">{r.category}</td>
                    <td className="px-3 py-2 text-[#e8e4dc]">{r.name}</td>
                    <td className="px-3 py-2 text-[rgba(232,228,220,0.5)]">{FLOOR_LABELS[r.floor] ?? r.floor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {importParseError && <p className="text-sm text-[#e06050]">{importParseError}</p>}
          <div className="flex gap-3">
            <button onClick={() => setImportRows([])} className="btn btn-secondary">← Re-upload</button>
            <button onClick={() => void handleImport('skip')} disabled={importing} className="btn btn-primary disabled:opacity-50">
              {importing ? 'Importing…' : `Import ${importRows.length} Drawings`}
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-[#e8e4dc] mb-1">Import Drawing List</h2>
            <p className="text-sm text-[rgba(232,228,220,0.45)]">Upload an Excel file with columns: S.No · Category · Drawing Name · Floor · Description</p>
          </div>
          <a href={`/api/projects/${projectId}/architecture/rows/template`} download
            className="flex items-center gap-2 text-sm text-[#c4a35a] hover:text-[#d4b36a] transition-colors">
            <Download className="w-4 h-4" />Download template with all 86 standard drawings pre-filled
          </a>
          <div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); }} />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-[rgba(255,255,255,0.1)] rounded-xl py-10 text-center hover:border-[rgba(196,163,90,0.4)] hover:bg-[rgba(196,163,90,0.03)] transition-all group">
              <Upload className="w-6 h-6 mx-auto mb-2 text-[rgba(232,228,220,0.3)] group-hover:text-[#c4a35a]" />
              <p className="text-sm text-[rgba(232,228,220,0.5)] group-hover:text-[rgba(232,228,220,0.8)]">Click to browse or drop file here</p>
              <p className="text-xs text-[rgba(232,228,220,0.25)] mt-1">Supports .xlsx · .xls · .csv</p>
            </button>
          </div>
          {importParseError && <p className="text-sm text-[#e06050] bg-[rgba(224,96,80,0.07)] border border-[rgba(224,96,80,0.2)] rounded-lg px-3 py-2">{importParseError}</p>}
        </div>
      )}
    </div>
  );

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 pb-32">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#e8e4dc]">Architecture</h1>
            <p className="text-sm text-[rgba(232,228,220,0.45)] mt-0.5">Drawing register, sets &amp; version control</p>
          </div>
          {myRole === 'CONSULTANT' && (
            <button onClick={() => setShowCreateSet(true)} className="btn btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />New Set
            </button>
          )}
        </div>

        {/* Inner tab bar */}
        <div className="border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-0.5">
            {tabs.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-all rounded-t-md ${
                  activeTab === tab
                    ? 'border-[#c4a35a] text-[#c4a35a] bg-[rgba(196,163,90,0.08)]'
                    : 'border-transparent text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] hover:border-[rgba(255,255,255,0.12)]'
                }`}>
                {tab}
                {tab === 'Review Queue' && (statsData?.pendingReview ?? 0) > 0 && (
                  <span className="ml-2 text-xs bg-[#fb923c] text-[#0e1016] rounded-full px-1.5 py-0.5 font-bold">{statsData?.pendingReview}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk success toast */}
        {bulkSuccess && (
          <div className="flex items-center gap-2 px-4 py-3 bg-[rgba(110,231,183,0.08)] border border-[rgba(110,231,183,0.25)] rounded-lg text-sm text-[#6ee7b7]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />{bulkSuccess}
          </div>
        )}

        {/* Tab content */}
        {activeTab === 'Overview' && renderOverview()}
        {(activeTab === 'Drawing Sets' || activeTab === 'My Sets') && (
          <div className="space-y-4">
            {setsError ? (
              <div className="card p-8 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-[#e06050] mx-auto" />
                <p className="text-sm font-medium text-[#e06050]">Could not load drawing sets</p>
                <p className="text-xs text-[rgba(232,228,220,0.4)] max-w-xs mx-auto">{String(setsError?.message ?? 'Server error')}</p>
                <button onClick={() => void refetchSets()} className="btn btn-secondary btn-sm mx-auto">Retry</button>
              </div>
            ) : sets.length === 0 ? (
              <div className="card p-10 text-center">
                <Layers className="w-8 h-8 text-[rgba(232,228,220,0.2)] mx-auto mb-3" />
                <p className="text-[rgba(232,228,220,0.45)] text-sm">No drawing sets yet.</p>
                {myRole === 'CONSULTANT' && (
                  <button onClick={() => setShowCreateSet(true)} className="btn btn-primary mt-4 mx-auto">Create First Set</button>
                )}
              </div>
            ) : sets.map(renderSetCard)}
          </div>
        )}
        {(activeTab === 'All Drawings' || activeTab === 'Approved Drawings') && renderAllDrawings()}
        {activeTab === 'Review Queue' && renderReviewQueue()}
        {activeTab === 'Payments' && renderPayments()}
        {activeTab === 'Import' && renderImportTab()}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          FLOATING BULK COMMAND BAR
          Slides up from bottom when ≥1 row is selected.
          ════════════════════════════════════════════════════════════════════ */}
      {canBulkAssign && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 pointer-events-none">
          <div className="pointer-events-auto bg-[#1a1d24]/95 backdrop-blur-xl border border-[rgba(255,255,255,0.12)] rounded-2xl shadow-2xl shadow-black/60">

            {/* Main bar */}
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Count badge */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-[rgba(196,163,90,0.15)] border border-[rgba(196,163,90,0.3)] flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-[#c4a35a]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#e8e4dc] leading-none">{selectedIds.size}</div>
                  <div className="text-xs text-[rgba(232,228,220,0.4)] leading-none mt-0.5">selected</div>
                </div>
              </div>

              {/* Quick-select shortcuts */}
              <div className="flex items-center gap-1.5 border-l border-[rgba(255,255,255,0.08)] pl-3">
                {selectedVisible.size < visibleIds.size && (
                  <button onClick={toggleAllVisible}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] hover:border-[rgba(255,255,255,0.2)] transition-all">
                    All {visibleIds.size} visible
                  </button>
                )}
                {filterCategory && (
                  <span className="text-xs px-2.5 py-1.5 rounded-lg bg-[rgba(196,163,90,0.08)] border border-[rgba(196,163,90,0.2)] text-[#c4a35a]">
                    {filterCategory}
                  </span>
                )}
                <button onClick={clearSelection}
                  className="text-xs px-2 py-1.5 text-[rgba(232,228,220,0.35)] hover:text-[rgba(232,228,220,0.7)] transition-colors flex items-center gap-1">
                  <X className="w-3 h-3" />Clear
                </button>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Unassign */}
              <button onClick={() => void handleBulkAssign(null)} disabled={bulkAssigning}
                className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] text-[rgba(232,228,220,0.5)] hover:text-[rgba(232,228,220,0.8)] hover:border-[rgba(255,255,255,0.2)] disabled:opacity-40 transition-all">
                Unassign
              </button>

              {/* Assign to set button */}
              <button onClick={() => { setShowBulkPicker(!showBulkPicker); setBulkCreateMode(false); }}
                className={`flex items-center gap-2 text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${
                  showBulkPicker
                    ? 'bg-[rgba(196,163,90,0.2)] border border-[rgba(196,163,90,0.5)] text-[#c4a35a]'
                    : 'bg-[#c4a35a] text-[#0e1016] hover:bg-[#d4b36a]'
                }`}>
                <Layers className="w-3.5 h-3.5" />
                Assign to Set
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBulkPicker ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Error */}
            {bulkError && (
              <div className="px-4 pb-2 text-xs text-[#e06050]">{bulkError}</div>
            )}

            {/* ── Set Picker Panel ── */}
            {showBulkPicker && (
              <div className="border-t border-[rgba(255,255,255,0.07)] p-3 max-h-72 overflow-y-auto space-y-1.5">
                <p className="text-xs text-[rgba(232,228,220,0.4)] px-1 pb-1">
                  Assign <span className="text-[#c4a35a] font-semibold">{selectedIds.size} drawing{selectedIds.size !== 1 ? 's' : ''}</span> to:
                </p>

                {/* Existing sets as clickable cards */}
                {sets.map((s) => {
                  const cfg = SET_STATUS_CONFIG[s.status];
                  const pct = s.rowStats.total > 0 ? Math.round((s.rowStats.approved / s.rowStats.total) * 100) : 0;
                  return (
                    <button key={s.id}
                      onClick={() => void handleBulkAssign(s.id)}
                      disabled={bulkAssigning}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[rgba(255,255,255,0.07)] hover:border-[rgba(196,163,90,0.35)] hover:bg-[rgba(196,163,90,0.05)] disabled:opacity-50 transition-all group text-left">
                      {/* Set icon */}
                      <div className="w-8 h-8 rounded-lg bg-[rgba(255,255,255,0.05)] flex items-center justify-center shrink-0 group-hover:bg-[rgba(196,163,90,0.1)] transition-colors">
                        <Layers className="w-3.5 h-3.5 text-[rgba(232,228,220,0.4)] group-hover:text-[#c4a35a]" />
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#e8e4dc] truncate">{s.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${cfg?.color ?? ''} ${cfg?.bg ?? ''}`}>{cfg?.label ?? s.status}</span>
                          {s.status === 'REQUESTED' && <Zap className="w-3 h-3 text-[#818cf8] shrink-0" />}
                        </div>
                        {s.rowStats.total > 0 && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-0.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                              <div className="h-full bg-[#6ee7b7] rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-[rgba(232,228,220,0.3)] shrink-0">{s.rowStats.approved}/{s.rowStats.total}</span>
                          </div>
                        )}
                      </div>
                      {/* Assign arrow */}
                      <ArrowRight className="w-3.5 h-3.5 text-[rgba(232,228,220,0.2)] group-hover:text-[#c4a35a] transition-colors shrink-0" />
                    </button>
                  );
                })}

                {/* Create new set inline */}
                {!bulkCreateMode ? (
                  <button onClick={() => setBulkCreateMode(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-[rgba(110,231,183,0.2)] hover:border-[rgba(110,231,183,0.4)] hover:bg-[rgba(110,231,183,0.03)] transition-all text-left group">
                    <div className="w-8 h-8 rounded-lg bg-[rgba(110,231,183,0.06)] flex items-center justify-center shrink-0 group-hover:bg-[rgba(110,231,183,0.12)] transition-colors">
                      <Plus className="w-3.5 h-3.5 text-[#6ee7b7]" />
                    </div>
                    <span className="text-sm text-[rgba(110,231,183,0.7)] group-hover:text-[#6ee7b7] transition-colors">Create new set &amp; assign</span>
                  </button>
                ) : (
                  <div className="rounded-xl border border-[rgba(110,231,183,0.2)] bg-[rgba(110,231,183,0.03)] p-3 space-y-2">
                    {bulkCreateError && <p className="text-xs text-[#e06050]">{bulkCreateError}</p>}
                    <input className="input text-sm py-2 w-full" placeholder="Set name *"
                      value={bulkNewSet.name} onChange={(e) => setBulkNewSet({ ...bulkNewSet, name: e.target.value })}
                      autoFocus />
                    <div className="flex gap-2">
                      <input className="input text-sm py-2 flex-1" type="number" min={0} placeholder="Fee (optional)"
                        value={bulkNewSet.cost} onChange={(e) => setBulkNewSet({ ...bulkNewSet, cost: e.target.value })} />
                      <select className="input text-sm py-2 w-24" value={bulkNewSet.currency}
                        onChange={(e) => setBulkNewSet({ ...bulkNewSet, currency: e.target.value })}>
                        {['INR', 'USD', 'AED', 'EUR'].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setBulkCreateMode(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
                      <button onClick={() => void handleBulkCreateAndAssign()}
                        disabled={bulkCreating || !bulkNewSet.name.trim()}
                        className="btn btn-primary btn-sm flex-1 disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {bulkCreating
                          ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</>
                          : <><Plus className="w-3 h-3" />Create &amp; Assign</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create Set Modal ─────────────────────────────────────────────── */}
      {showCreateSet && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setShowCreateSet(false)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between p-6 pb-4 border-b border-[rgba(255,255,255,0.07)]">
              <div>
                <h2 className="text-lg font-semibold text-[#e8e4dc]">Create Drawing Set</h2>
                <p className="text-sm text-[rgba(232,228,220,0.45)] mt-0.5">Add drawings manually now, or leave the list empty and add them later.</p>
              </div>
              <button onClick={() => setShowCreateSet(false)} className="text-[rgba(232,228,220,0.3)] hover:text-[rgba(232,228,220,0.7)]"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {createSetError && <div className="alert alert-error">{createSetError}</div>}
              <div className="grid md:grid-cols-[1fr_160px_110px] gap-3">
                <div><label className="label">Set Name *</label>
                  <input className="input" placeholder="e.g. Working Drawing Set 1" value={newSet.name} onChange={(e) => setNewSet({ ...newSet, name: e.target.value })} /></div>
                <div><label className="label">Fee Amount</label>
                  <input className="input" type="number" min={0} value={newSet.cost} onChange={(e) => setNewSet({ ...newSet, cost: e.target.value })} /></div>
                <div><label className="label">Currency</label>
                  <select className="input" value={newSet.currency} onChange={(e) => setNewSet({ ...newSet, currency: e.target.value })}>
                    {['INR', 'USD', 'AED', 'EUR'].map((c) => <option key={c}>{c}</option>)}
                  </select></div>
              </div>
              <div><label className="label">Description</label>
                <textarea className="input resize-none" rows={2} value={newSet.description} onChange={(e) => setNewSet({ ...newSet, description: e.target.value })} /></div>

              <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden">
                <div className="px-4 py-3 bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.07)]">
                  <h3 className="text-sm font-semibold text-[#e8e4dc]">Manual Drawings</h3>
                  <p className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">Use this when there is no Excel sheet.</p>
                </div>
                <div className="divide-y divide-[rgba(255,255,255,0.06)]">
                  {newSetDrawings.map((drawing, index) => (
                    <div key={index} className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[rgba(232,228,220,0.45)]">
                          <FileText className="w-3.5 h-3.5" />Drawing {index + 1}
                        </div>
                        <button type="button" onClick={() => removeNewSetDrawing(index)}
                          className="w-7 h-7 rounded-lg border border-[rgba(255,255,255,0.08)] text-[rgba(232,228,220,0.35)] hover:text-[#e06050] hover:border-[rgba(224,96,80,0.25)] flex items-center justify-center transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid md:grid-cols-[150px_1fr_140px] gap-3">
                        <div>
                          <label className="label text-xs">Category</label>
                          <input className="input text-sm py-2" placeholder="Architectural" value={drawing.category}
                            onChange={(e) => updateNewSetDrawing(index, { category: e.target.value })} />
                        </div>
                        <div>
                          <label className="label text-xs">Drawing Name</label>
                          <input className="input text-sm py-2" placeholder="e.g. Ground floor plan" value={drawing.name}
                            onChange={(e) => updateNewSetDrawing(index, { name: e.target.value })} />
                        </div>
                        <div>
                          <label className="label text-xs">Floor</label>
                          <input className="input text-sm py-2" placeholder="e.g. Ground, 3rd, Terrace" value={drawing.floor}
                            onChange={(e) => updateNewSetDrawing(index, { floor: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label className="label text-xs">Description <span className="text-[rgba(232,228,220,0.3)]">(optional)</span></label>
                        <input className="input text-sm py-2" placeholder="Notes, scope, or drawing reference" value={drawing.description}
                          onChange={(e) => updateNewSetDrawing(index, { description: e.target.value })} />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addNewSetDrawing}
                    className="w-full flex items-center justify-center gap-2 py-3 text-xs text-[rgba(232,228,220,0.4)] hover:text-[#c4a35a] hover:bg-[rgba(196,163,90,0.05)] transition-colors border-t border-dashed border-[rgba(255,255,255,0.08)]">
                    <Plus className="w-3.5 h-3.5" />Add Drawing
                  </button>
                  <div ref={manualDrawingsEndRef} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 pt-4 border-t border-[rgba(255,255,255,0.07)]">
              <button onClick={() => setShowCreateSet(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void handleCreateSet()} disabled={creatingSet || !newSet.name.trim()} className="btn btn-primary disabled:opacity-50">
                {creatingSet ? 'Creating…' : 'Create Set'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Request Set Modal ────────────────────────────────────────────── */}
      {requestModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setRequestModal(null)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#e8e4dc]">Request Drawing Set</h2>
                <p className="text-sm text-[rgba(232,228,220,0.55)] mt-0.5">{requestModal.setName}</p>
              </div>
              <button onClick={() => setRequestModal(null)} className="text-[rgba(232,228,220,0.3)] hover:text-[rgba(232,228,220,0.7)]"><X className="w-5 h-5" /></button>
            </div>
            {requestError && <div className="alert alert-error">{requestError}</div>}
            <div>
              <label className="label">Due Date *</label>
              <input
                className="input"
                type="date"
                value={requestForm.dueDate}
                onChange={(e) => setRequestForm({ ...requestForm, dueDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Note <span className="text-[rgba(232,228,220,0.3)]">(optional)</span></label>
              <textarea
                className="input resize-none"
                rows={3}
                value={requestForm.note}
                onChange={(e) => setRequestForm({ ...requestForm, note: e.target.value })}
                placeholder="Add drawing instructions or priority notes"
              />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setRequestModal(null)} className="btn btn-secondary">Cancel</button>
              <button
                onClick={() => void handleRequestSet()}
                disabled={actionLoading === requestModal.setId || !requestForm.dueDate}
                className="btn btn-primary disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading === requestModal.setId ? 'Requesting…' : <><Calendar className="w-3.5 h-3.5" />Request Set</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Modal ─────────────────────────────────────────────────── */}
      {uploadModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setUploadModal(null)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#e8e4dc]">{uploadModal.currentVersionNo !== undefined ? 'Upload Revision' : 'Upload Drawing'}</h2>
                <p className="text-sm text-[rgba(232,228,220,0.55)] mt-0.5">{uploadModal.rowName}</p>
              </div>
              <button onClick={() => setUploadModal(null)} className="text-[rgba(232,228,220,0.3)] hover:text-[rgba(232,228,220,0.7)]"><X className="w-5 h-5" /></button>
            </div>
            {uploadModal.setName && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${uploadModal.setStatus === 'REQUESTED' ? 'bg-[rgba(129,140,248,0.08)] border-[rgba(129,140,248,0.25)] text-[#818cf8]' : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[rgba(232,228,220,0.45)]'}`}>
                {uploadModal.setStatus === 'REQUESTED' && <Zap className="w-3 h-3 shrink-0" />}
                <Layers className="w-3 h-3 shrink-0" />
                <span className="font-medium">{uploadModal.setName}</span>
                {uploadModal.setStatus === 'REQUESTED' && <span className="ml-auto bg-[rgba(129,140,248,0.15)] px-1.5 py-0.5 rounded-full font-semibold">PMC Requested</span>}
              </div>
            )}
            {uploadModal.currentVersionNo !== undefined && (
              <div className="flex items-center gap-2 text-xs text-[rgba(232,228,220,0.45)]">
                <span className="bg-[rgba(255,255,255,0.06)] px-2 py-0.5 rounded">v{uploadModal.currentVersionNo}</span>
                <ArrowRight className="w-3 h-3" />
                <span className="bg-[rgba(196,163,90,0.1)] text-[#c4a35a] px-2 py-0.5 rounded">v{uploadModal.currentVersionNo + 1}</span>
              </div>
            )}
            {uploadError && <div className="alert alert-error">{uploadError}</div>}
            <div className="grid grid-cols-2 gap-2">
              {(['PDF', 'URL'] as const).map((t) => (
                <button key={t} onClick={() => setUploadType(t)}
                  className={`flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border transition-all ${uploadType === t ? 'bg-[rgba(196,163,90,0.15)] border-[rgba(196,163,90,0.4)] text-[#c4a35a]' : 'border-[rgba(255,255,255,0.08)] text-[rgba(232,228,220,0.55)] hover:border-[rgba(255,255,255,0.15)]'}`}>
                  {t === 'PDF' ? <FileUp className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                  {t === 'PDF' ? 'PDF File' : 'Drive / URL'}
                </button>
              ))}
            </div>
            {uploadType === 'PDF' ? (
              <div>
                <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => pdfInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-xl py-8 text-center transition-all group ${uploadFile ? 'border-[rgba(110,231,183,0.4)] bg-[rgba(110,231,183,0.04)]' : 'border-[rgba(255,255,255,0.1)] hover:border-[rgba(196,163,90,0.4)]'}`}>
                  {uploadFile ? (
                    <div className="space-y-1">
                      <CheckCircle2 className="w-6 h-6 mx-auto text-[#6ee7b7]" />
                      <p className="text-sm font-medium text-[#6ee7b7]">{uploadFile.name}</p>
                      <p className="text-xs text-[rgba(232,228,220,0.35)]">{Math.ceil(uploadFile.size / 1024)} KB · Click to change</p>
                    </div>
                  ) : (
                    <><FileUp className="w-6 h-6 mx-auto mb-2 text-[rgba(232,228,220,0.3)] group-hover:text-[#c4a35a]" />
                    <p className="text-sm text-[rgba(232,228,220,0.5)]">Click to select PDF</p></>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div><label className="label">Drawing URL *</label>
                  <input className="input" type="url" placeholder="https://drive.google.com/file/…" value={uploadUrl} onChange={(e) => setUploadUrl(e.target.value)} /></div>
                <div><label className="label">Display Name <span className="text-[rgba(232,228,220,0.3)]">(optional)</span></label>
                  <input className="input" placeholder="e.g. Floor Plan Rev A" value={uploadFileName} onChange={(e) => setUploadFileName(e.target.value)} /></div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setUploadModal(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void handleUpload()} disabled={uploading || (uploadType === 'PDF' ? !uploadFile : !uploadUrl.trim())}
                className="btn btn-primary disabled:opacity-50 flex items-center gap-2">
                {uploading ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading…</> : <><Upload className="w-3.5 h-3.5" />Upload{uploadModal.currentVersionNo !== undefined ? ` v${uploadModal.currentVersionNo + 1}` : ''}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review Modal ─────────────────────────────────────────────────── */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setReviewModal(null)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">Review Drawing</h2>
              <button onClick={() => setReviewModal(null)} className="text-[rgba(232,228,220,0.3)] hover:text-[rgba(232,228,220,0.7)]"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-[rgba(232,228,220,0.55)]">{reviewModal.rowName}</p>
            {reviewError && <div className="alert alert-error">{reviewError}</div>}
            <div className="grid grid-cols-2 gap-2">
              {(['APPROVE', 'REJECT'] as const).map((a) => (
                <button key={a} onClick={() => setReviewAction(a)}
                  className={`py-3 text-sm rounded-lg border font-medium flex items-center justify-center gap-2 transition-all ${reviewAction === a
                    ? a === 'APPROVE' ? 'bg-[rgba(110,231,183,0.12)] border-[rgba(110,231,183,0.3)] text-[#6ee7b7]' : 'bg-[rgba(224,96,80,0.12)] border-[rgba(224,96,80,0.3)] text-[#e06050]'
                    : 'border-[rgba(255,255,255,0.08)] text-[rgba(232,228,220,0.55)] hover:border-[rgba(255,255,255,0.15)]'}`}>
                  {a === 'APPROVE' ? <><CheckCircle2 className="w-4 h-4" />Approve</> : <><XCircle className="w-4 h-4" />Reject</>}
                </button>
              ))}
            </div>
            {reviewAction === 'REJECT' && (
              <div><label className="label">Rejection Reason *</label>
                <textarea className="input resize-none" rows={3} value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} placeholder="Describe what needs to be corrected…" /></div>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => { setReviewModal(null); setReviewReason(''); }} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void handleReview()} disabled={reviewing || (reviewAction === 'REJECT' && !reviewReason.trim())}
                className={`btn disabled:opacity-50 ${reviewAction === 'APPROVE' ? 'btn-success' : 'bg-[#e06050] text-white hover:bg-[#c8503f]'}`}>
                {reviewing ? '…' : reviewAction === 'APPROVE' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Version History Modal ─────────────────────────────────────────── */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setHistoryModal(null)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">Version History</h2>
              <button onClick={() => setHistoryModal(null)} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc]"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-[rgba(232,228,220,0.55)]">{historyModal.rowName}</p>
            {!versionHistory ? <p className="text-sm text-[rgba(232,228,220,0.35)]">Loading…</p>
              : versionHistory.length === 0 ? <p className="text-sm text-[rgba(232,228,220,0.35)]">No versions yet.</p>
              : (
                <div className="space-y-2">
                  {versionHistory.map((v) => (
                    <div key={v.id} className={`p-3 rounded-lg border ${v.isCurrent ? 'border-[rgba(196,163,90,0.3)] bg-[rgba(196,163,90,0.05)]' : 'border-[rgba(255,255,255,0.07)]'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#e8e4dc]">v{v.versionNumber}</span>
                          {v.isCurrent && <span className="text-xs text-[#c4a35a] bg-[rgba(196,163,90,0.1)] px-1.5 py-0.5 rounded">Current</span>}
                          <StatusBadge status={v.reviewStatus} type="version" />
                        </div>
                        {v.uploadType === 'URL'
                          ? <a href={v.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#c4a35a] hover:underline flex items-center gap-1"><LinkIcon className="w-3 h-3" />Open</a>
                          : (
                            <div className="flex items-center gap-2">
                              <a href={drawingFileHref(v.id)} target="_blank" rel="noopener noreferrer" className="text-xs text-[#c4a35a] hover:underline flex items-center gap-1"><Eye className="w-3 h-3" />View</a>
                              <a href={drawingFileHref(v.id, true)} className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[#c4a35a] flex items-center gap-1"><Download className="w-3 h-3" />Download</a>
                            </div>
                          )}
                      </div>
                      <div className="text-xs text-[rgba(232,228,220,0.35)] mt-1">{v.uploadedBy.name} · {formatDate(v.uploadedAt)}{v.reviewedBy && ` · Reviewed by ${v.reviewedBy.name}`}</div>
                      {v.rejectionReason && <div className="text-xs text-[#e06050] mt-1">✕ {v.rejectionReason}</div>}
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}

      {/* ── Single-row Assign Modal (visual card selector) ───────────────── */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setAssignModal(null)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between p-6 pb-4 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-[#e8e4dc]">Assign to Drawing Set</h2>
                <p className="text-sm text-[rgba(232,228,220,0.5)] mt-0.5">{assignModal.rowName}</p>
              </div>
              <button onClick={() => setAssignModal(null)} className="text-[rgba(232,228,220,0.3)] hover:text-[rgba(232,228,220,0.7)]"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-2 min-h-0">
              {/* Unassign option */}
              <button onClick={() => { setAssignSetId(''); setAssignCreateMode(false); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${assignSetId === '' ? 'border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.05)]' : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.13)]'}`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${assignSetId === '' ? 'border-[#e8e4dc] bg-[#e8e4dc]' : 'border-[rgba(255,255,255,0.25)]'}`}>
                  {assignSetId === '' && <div className="w-2 h-2 rounded-full bg-[#13151a]" />}
                </div>
                <span className="text-sm text-[rgba(232,228,220,0.65)]">— No set (unassigned)</span>
              </button>
              {/* Existing sets */}
              {sets.map((s) => {
                const cfg = SET_STATUS_CONFIG[s.status];
                const isSelected = assignSetId === s.id;
                const pct = s.rowStats.total > 0 ? Math.round((s.rowStats.approved / s.rowStats.total) * 100) : 0;
                return (
                  <button key={s.id} onClick={() => { setAssignSetId(s.id); setAssignCreateMode(false); }}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${isSelected ? 'border-[rgba(196,163,90,0.5)] bg-[rgba(196,163,90,0.06)]' : s.status === 'REQUESTED' ? 'border-[rgba(129,140,248,0.25)] hover:border-[rgba(129,140,248,0.4)]' : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.13)]'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${isSelected ? 'border-[#c4a35a] bg-[#c4a35a]' : 'border-[rgba(255,255,255,0.25)]'}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-[#13151a]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#e8e4dc]">{s.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg?.color ?? ''} ${cfg?.bg ?? ''}`}>{cfg?.label ?? s.status}</span>
                          {s.status === 'REQUESTED' && <span className="flex items-center gap-1 text-xs text-[#818cf8]"><Zap className="w-3 h-3" />PMC Requested</span>}
                        </div>
                        {s.rowStats.total > 0 && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-1 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                              <div className="h-full bg-[#6ee7b7] rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-[rgba(232,228,220,0.35)]">{s.rowStats.approved}/{s.rowStats.total}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-[rgba(232,228,220,0.35)]">{s.rowStats.total} drawings</span>
                          {s.cost > 0 && <span className="text-xs text-[#c4a35a]">₹{s.cost.toLocaleString('en-IN')}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {/* Inline create */}
              <button onClick={() => { setAssignCreateMode(!assignCreateMode); setAssignSetId('__new__'); }}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${assignCreateMode ? 'border-[rgba(110,231,183,0.35)] bg-[rgba(110,231,183,0.04)]' : 'border-dashed border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]'}`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${assignCreateMode ? 'border-[#6ee7b7]' : 'border-[rgba(255,255,255,0.2)]'}`}>
                  <Plus className={`w-3 h-3 ${assignCreateMode ? 'text-[#6ee7b7]' : 'text-[rgba(255,255,255,0.4)]'}`} />
                </div>
                <span className={`text-sm font-medium ${assignCreateMode ? 'text-[#6ee7b7]' : 'text-[rgba(232,228,220,0.55)]'}`}>Create &amp; assign to new set</span>
              </button>
              {assignCreateMode && (
                <div className="rounded-xl border border-[rgba(110,231,183,0.2)] bg-[rgba(110,231,183,0.03)] p-4 space-y-3">
                  {assignCreateError && <p className="text-xs text-[#e06050]">{assignCreateError}</p>}
                  <div><label className="label text-xs">Set Name *</label>
                    <input className="input text-sm py-2" placeholder="e.g. Structural Set" value={assignNewSet.name} onChange={(e) => setAssignNewSet({ ...assignNewSet, name: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="label text-xs">Fee</label>
                      <input className="input text-sm py-2" type="number" min={0} placeholder="0" value={assignNewSet.cost} onChange={(e) => setAssignNewSet({ ...assignNewSet, cost: e.target.value })} /></div>
                    <div><label className="label text-xs">Currency</label>
                      <select className="input text-sm py-2" value={assignNewSet.currency} onChange={(e) => setAssignNewSet({ ...assignNewSet, currency: e.target.value })}>
                        {['INR', 'USD', 'AED', 'EUR'].map((c) => <option key={c}>{c}</option>)}
                      </select></div>
                  </div>
                </div>
              )}
              {assignError && <p className="text-xs text-[#e06050] px-1">{assignError}</p>}
            </div>
            <div className="flex items-center justify-between gap-3 p-6 pt-4 border-t border-[rgba(255,255,255,0.07)] shrink-0">
              <div className="text-xs text-[rgba(232,228,220,0.35)] truncate">
                {assignSetId && assignSetId !== '__new__' ? `→ ${sets.find((s) => s.id === assignSetId)?.name}` : assignCreateMode ? '→ New set' : ''}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAssignModal(null)} className="btn btn-secondary btn-sm">Cancel</button>
                {assignCreateMode ? (
                  <button onClick={() => void handleAssignCreateAndAssign()} disabled={assignCreating || !assignNewSet.name.trim()} className="btn btn-primary btn-sm disabled:opacity-50 flex items-center gap-1.5">
                    {assignCreating ? '…' : <><Plus className="w-3.5 h-3.5" />Create &amp; Assign</>}
                  </button>
                ) : (
                  <button onClick={() => void handleAssign()} disabled={assigning || assignSetId === '__new__'} className="btn btn-primary btn-sm disabled:opacity-50">
                    {assigning ? '…' : assignSetId ? 'Assign' : 'Unassign'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
