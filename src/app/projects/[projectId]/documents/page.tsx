'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { Plus, FileText, ClipboardList, CalendarDays, Trash2, Upload } from 'lucide-react';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import ProjectSwitcher from '@/components/ProjectSwitcher';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { parseChecklistExcel } from '@/lib/excel/parseChecklistExcel';

type DocTab = 'Specs' | 'Other Docs' | 'Checklists' | 'DPR';

interface ChecklistSummary {
  id: string;
  title: string;
  docRefNo: string;
  referenceDrawingNo: string;
  status: string;
  signedAt: string | null;
  signedByName: string | null;
  createdAt: string;
  createdByName: string;
  itemCount: number;
  filledCount: number;
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'badge-draft',
  IN_PROGRESS: 'badge-in-progress',
  SIGNED: 'badge-verified',
};

export default function DocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const tabs: DocTab[] = myRole === 'VENDOR' ? ['Specs', 'Other Docs'] : ['Specs', 'Other Docs', 'Checklists', 'DPR'];
  const [activeTab, setActiveTab] = useState<DocTab>('Specs');

  // ── Checklists tab state ──────────────────────────────────────────────────
  const { data: checklists, isLoading: checklistsLoading, mutate: refetchChecklists } = useSWR<ChecklistSummary[]>(
    activeTab === 'Checklists' && projectId ? `/api/projects/${projectId}/checklists` : null,
    jsonFetcher,
  );
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDrawingNo, setNewDrawingNo] = useState('');
  const [newItems, setNewItems] = useState<string[]>(['']);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [parsingExcel, setParsingExcel] = useState(false);

  // Drawing picker for "Reference Drawing No." — only fetched while the modal is open. A
  // <datalist> combobox rather than a plain <select> so PMC can still type a drawing that
  // isn't in the Architecture module yet (referenceDrawingNo stays free text on purpose).
  const { data: drawingRows } = useSWR<Array<{ id: string; serialNo: number; name: string; category: string }>>(
    showCreate && projectId ? `/api/projects/${projectId}/architecture/rows` : null,
    jsonFetcher,
  );

  const resetCreateForm = () => {
    setNewTitle(''); setNewDrawingNo(''); setNewItems(['']); setCreateError('');
  };

  const handleChecklistExcelUpload = async (file: File) => {
    setCreateError('');
    setParsingExcel(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: false });
      const parsed = parseChecklistExcel(rows);
      if (parsed.title) setNewTitle(parsed.title);
      if (parsed.referenceDrawingNo) setNewDrawingNo(parsed.referenceDrawingNo);
      if (parsed.items.length > 0) setNewItems(parsed.items);
      if (!parsed.title && parsed.items.length === 0) {
        setCreateError('Could not find checklist fields in this file — check the format or fill the fields manually.');
      }
    } catch {
      setCreateError('Failed to read that Excel file.');
    } finally {
      setParsingExcel(false);
    }
  };

  const handleCreateChecklist = async () => {
    setCreateError('');
    const items = newItems.map((i) => i.trim()).filter(Boolean);
    const missing: string[] = [];
    if (!newTitle.trim()) missing.push('title');
    if (!newDrawingNo.trim()) missing.push('reference drawing number');
    if (items.length === 0) missing.push('at least one check point');
    if (missing.length > 0) {
      // Excel imports commonly leave this one blank — the sample templates ship with the
      // "Reference Drawing no:" cell empty (filled in by hand later), so calling out exactly
      // which field is still missing avoids the imported title/items looking untrustworthy.
      setCreateError(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), referenceDrawingNo: newDrawingNo.trim(), items: items.map((description) => ({ description })) }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        resetCreateForm();
        void refetchChecklists();
        router.push(`/projects/${projectId}/documents/checklists/${data.data.id}`);
      } else {
        setCreateError(data.error || 'Failed to create checklist');
      }
    } catch {
      setCreateError('Failed to create checklist');
    } finally {
      setCreating(false);
    }
  };

  if (projectLoading) return <Layout><TablePageSkeleton /></Layout>;

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 pb-32">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px]" style={{ color: 'rgba(232,228,220,0.35)' }}>Documents ·</span>
            <ProjectSwitcher
              currentProjectId={projectId}
              currentProjectName={projectName}
              buildHref={(id) => `/projects/${id}/documents`}
            />
          </div>
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Documents</h1>
          <p className="text-sm text-[rgba(232,228,220,0.45)] mt-0.5">Specs, checklists, and daily progress reports</p>
        </div>

        {/* Inner tab bar */}
        <div className="border-b" style={{ borderColor: 'var(--ax-border)' }}>
          <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-0.5">
            {tabs.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-all rounded-t-md ${
                  activeTab === tab ? 'ax-tab-active' : 'ax-tab-inactive'
                }`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* ── Specs / Other Docs ── */}
        {(activeTab === 'Specs' || activeTab === 'Other Docs') && (
          <DocumentLibraryTab
            projectId={projectId}
            category={activeTab === 'Specs' ? 'SPEC' : 'OTHER'}
            myRole={myRole}
          />
        )}

        {/* ── Checklists ── */}
        {activeTab === 'Checklists' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">Checklists</h2>
              {myRole === 'PMC' && (
                <button onClick={() => setShowCreate(true)} className="btn btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />New Checklist
                </button>
              )}
            </div>

            {checklistsLoading ? (
              <TablePageSkeleton />
            ) : !checklists || checklists.length === 0 ? (
              <div className="card">
                <div className="card-body text-center py-12 text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>
                  No checklists yet.
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="card-body p-0">
                  <div className="divide-y" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                    {checklists.map((c) => (
                      <Link
                        key={c.id}
                        href={`/projects/${projectId}/documents/checklists/${c.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[rgba(var(--ax-accent-rgb),0.03)] transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ClipboardList className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }} />
                          <div className="min-w-0">
                            <p className="text-sm truncate" style={{ color: 'var(--ax-text)' }}>{c.docRefNo} · {c.title}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.35)' }}>
                              Drawing {c.referenceDrawingNo} · {c.filledCount}/{c.itemCount} filled · by {c.createdByName} on {formatDate(c.createdAt)}
                            </p>
                          </div>
                        </div>
                        <span className={`badge ${STATUS_BADGE[c.status] ?? 'badge-draft'} shrink-0`}>{c.status.replace('_', ' ')}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DPR ── */}
        {activeTab === 'DPR' && <DPRTab projectId={projectId} myRole={myRole} />}
      </div>

      {/* Create Checklist modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border" style={{ backgroundColor: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}>
            <div className="sticky top-0 px-6 py-4 border-b flex items-center justify-between" style={{ backgroundColor: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--ax-text)' }}>New Checklist</h2>
            </div>
            <div className="p-6 space-y-4">
              {createError && <div className="alert alert-error">{createError}</div>}
              <label
                htmlFor="checklist-excel-upload"
                className={`p-3 rounded-lg border border-dashed flex items-center gap-3 transition-colors ${parsingExcel ? 'cursor-wait' : 'cursor-pointer hover:bg-[rgba(var(--ax-accent-rgb),0.04)]'}`}
                style={{ borderColor: 'var(--ax-border)' }}
              >
                <Upload className="w-4 h-4 shrink-0" style={{ color: 'rgba(232,228,220,0.4)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--ax-text)' }}>
                    {parsingExcel ? 'Reading Excel…' : 'Import from Excel'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.35)' }}>
                    Upload a filled-in checklist file to auto-fill the fields below — review before creating.
                  </p>
                </div>
                <input
                  id="checklist-excel-upload" type="file" accept=".xlsx,.xls" className="hidden" disabled={parsingExcel}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleChecklistExcelUpload(f); e.target.value = ''; }}
                />
              </label>
              <div>
                <label className="label">Checklist Type / Title *</label>
                <input type="text" className="input" placeholder="e.g. Waterproofing" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              </div>
              <div>
                <label className="label">Reference Drawing No. *</label>
                <input
                  type="text" className="input" list="drawing-row-options"
                  placeholder="Pick from Architecture, or type a drawing number"
                  value={newDrawingNo} onChange={(e) => setNewDrawingNo(e.target.value)}
                />
                <datalist id="drawing-row-options">
                  {(drawingRows ?? []).map((row) => (
                    <option key={row.id} value={`#${row.serialNo} · ${row.name}`} />
                  ))}
                </datalist>
                <p className="text-xs mt-1" style={{ color: 'rgba(232,228,220,0.35)' }}>
                  Start typing to pick an existing drawing from Architecture, or enter one manually.
                </p>
              </div>
              <div>
                <label className="label">Check Points *</label>
                <div className="space-y-2">
                  {newItems.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text" className="input flex-1" placeholder={`Check point ${i + 1}`}
                        value={item}
                        onChange={(e) => setNewItems((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                      />
                      {newItems.length > 1 && (
                        <button
                          onClick={() => setNewItems((prev) => prev.filter((_, idx) => idx !== i))}
                          className="p-2 rounded-lg hover:text-[#e06050] transition-colors"
                          style={{ color: 'rgba(232,228,220,0.35)' }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setNewItems((prev) => [...prev, ''])} className="btn btn-secondary text-sm mt-2 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />Add check point
                </button>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => { setShowCreate(false); resetCreateForm(); }} className="btn btn-secondary">Cancel</button>
                <button onClick={() => void handleCreateChecklist()} disabled={creating} className="btn btn-primary disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create Checklist'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ── Specs / Other Docs library tab ──────────────────────────────────────────
interface ProjectDocumentSummary {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  uploadedByName: string;
  files: { id: string; fileName: string; size: number }[];
}

function DocumentLibraryTab({ projectId, category, myRole }: { projectId: string; category: 'SPEC' | 'OTHER'; myRole: string }) {
  const { data: documents, isLoading, mutate: refetch } = useSWR<ProjectDocumentSummary[]>(
    `/api/projects/${projectId}/documents?category=${category}`,
    jsonFetcher,
  );
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const canUpload = myRole === 'PMC' || myRole === 'CONSULTANT';
  const label = category === 'SPEC' ? 'Specs' : 'Other Docs';

  const handleUpload = async () => {
    setError('');
    if (!title.trim() || !file) {
      setError('Title and a file are required.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('category', category);
      fd.append('title', title.trim());
      if (description.trim()) fd.append('description', description.trim());
      fd.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/documents`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setShowUpload(false);
        setTitle(''); setDescription(''); setFile(null);
        void refetch();
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm('Delete this document?')) return;
    const res = await fetch(`/api/projects/${projectId}/documents/${documentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) void refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[#e8e4dc]">{label}</h2>
        {canUpload && (
          <button onClick={() => setShowUpload(true)} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />Upload
          </button>
        )}
      </div>

      {isLoading ? (
        <TablePageSkeleton />
      ) : !documents || documents.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12 text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>
            No {label.toLowerCase()} uploaded yet.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body p-0">
            <div className="divide-y" style={{ borderColor: 'var(--ax-border-subtle)' }}>
              {documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }} />
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--ax-text)' }}>{d.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.35)' }}>
                        {d.uploadedByName} · {formatDate(d.createdAt)}{d.description ? ` · ${d.description}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {d.files[0] && (
                      <a href={`/api/projects/${projectId}/documents/${d.id}/files/${d.files[0].id}`} className="text-xs font-medium" style={{ color: 'var(--ax-accent)' }}>
                        Download
                      </a>
                    )}
                    {canUpload && (
                      <button onClick={() => void handleDelete(d.id)} className="p-1 rounded hover:text-[#e06050] transition-colors" style={{ color: 'rgba(232,228,220,0.3)' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-md border" style={{ backgroundColor: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--ax-border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--ax-text)' }}>Upload to {label}</h2>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="alert alert-error">{error}</div>}
              <div>
                <label className="label">Title *</label>
                <input type="text" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="label">File *</label>
                <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setShowUpload(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={() => void handleUpload()} disabled={uploading} className="btn btn-primary disabled:opacity-50">
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DPR tab ──────────────────────────────────────────────────────────────
interface DPRSummary {
  id: string;
  reportDate: string;
  docRefNo: string;
  status: string;
  createdByName: string;
}

function DPRTab({ projectId, myRole }: { projectId: string; myRole: string }) {
  const router = useRouter();
  const { data: dprs, isLoading, mutate: refetch } = useSWR<DPRSummary[]>(`/api/projects/${projectId}/dpr`, jsonFetcher);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const todaysDpr = dprs?.find((d) => d.reportDate === today);

  const handleCreateToday = async () => {
    setError('');
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/dpr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportDate: today, periodFrom: today, periodTo: today, procurementRows: [], manpowerRows: [], highlights: [] }),
      });
      const data = await res.json();
      if (data.success) {
        void refetch();
        router.push(`/projects/${projectId}/documents/dpr/${data.data.id}`);
      } else {
        setError(data.error || 'Failed to create DPR');
      }
    } catch {
      setError('Failed to create DPR');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[#e8e4dc]">Daily Progress Reports</h2>
        {myRole === 'SITE_ENGINEER' && !todaysDpr && (
          <button onClick={() => void handleCreateToday()} disabled={creating} className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
            <Plus className="w-4 h-4" />{creating ? 'Creating…' : "Create Today's DPR"}
          </button>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {isLoading ? (
        <TablePageSkeleton />
      ) : !dprs || dprs.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12 text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>
            No daily progress reports yet.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body p-0">
            <div className="divide-y" style={{ borderColor: 'var(--ax-border-subtle)' }}>
              {dprs.map((d) => (
                <Link
                  key={d.id}
                  href={`/projects/${projectId}/documents/dpr/${d.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[rgba(var(--ax-accent-rgb),0.03)] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CalendarDays className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }} />
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--ax-text)' }}>{d.docRefNo} · {formatDate(d.reportDate)}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.35)' }}>by {d.createdByName}</p>
                    </div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[d.status] ?? 'badge-draft'} shrink-0`}>{d.status}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
