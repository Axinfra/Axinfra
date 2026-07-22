'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Download, Upload, CheckCircle2, Plus, Trash2, Camera, AlertTriangle } from 'lucide-react';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate, formatDateTime } from '@/lib/utils';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { parseDprExcel } from '@/lib/excel/parseDprExcel';
import { extractExcelImages } from '@/lib/excel/extractExcelImages';

interface ProcurementRow {
  materialName: string; description: string | null; unit: string;
  alreadyReceived: number; receivedThisWeek: number; cumulativeReceivedTillDate: number;
  consumedTillDate: number; balanceAtSite: number; additionalRequirement: string | null;
}
interface ManpowerRow {
  vendorName: string; tradeName: string; unit: string; actualCount: number; plannedCount: number;
}
interface Highlight { description: string; }
interface Photo { id: string; fileName: string; remarks: string | null; }

interface DPRDetail {
  id: string;
  reportDate: string;
  docRefNo: string;
  status: string;
  criticalIssues: string | null;
  procurementRows: ProcurementRow[];
  manpowerRows: ManpowerRow[];
  highlights: Highlight[];
  photos: Photo[];
  signedAt: string | null;
  signedBy: { name: string } | null;
  projectName: string;
  clientName: string;
  duration: { totalDurationDays: number; elapsedDays: number; balanceDays: number } | null;
  canFill: boolean;
}

const emptyProcurementRow = (): ProcurementRow => ({
  materialName: '', description: '', unit: '', alreadyReceived: 0, receivedThisWeek: 0,
  cumulativeReceivedTillDate: 0, consumedTillDate: 0, balanceAtSite: 0, additionalRequirement: '',
});
const emptyManpowerRow = (): ManpowerRow => ({ vendorName: '', tradeName: '', unit: '', actualCount: 0, plannedCount: 0 });

export default function DPRDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const dprId = params.dprId as string;
  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const { data: dpr, isLoading, mutate: refetch } = useSWR<DPRDetail>(`/api/projects/${projectId}/dpr/${dprId}`, jsonFetcher);

  const [procurementRows, setProcurementRows] = useState<ProcurementRow[]>([]);
  const [manpowerRows, setManpowerRows] = useState<ManpowerRow[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [criticalIssues, setCriticalIssues] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Photo upload state — uploads immediately (like Specs/Other Docs) rather than batched with
  // Save Draft, since it's a file upload, not simple form state.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoRemarks, setPhotoRemarks] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Excel import — parses client-side and drops values into the same local state the manual
  // form fields use, so nothing is persisted until the user reviews and hits Save Draft.
  // Extracted photos are the exception: they upload immediately, matching how manual photo
  // upload already behaves (see the comment above).
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [parsingExcel, setParsingExcel] = useState(false);

  useEffect(() => {
    if (!dpr) return;
    setProcurementRows(dpr.procurementRows.length > 0 ? dpr.procurementRows : []);
    setManpowerRows(dpr.manpowerRows.length > 0 ? dpr.manpowerRows : []);
    setHighlights(dpr.highlights.length > 0 ? dpr.highlights : []);
  }, [dpr]);

  const effectiveCriticalIssues = criticalIssues ?? dpr?.criticalIssues ?? '';

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/dpr/${dprId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procurementRows, manpowerRows, highlights, criticalIssues: effectiveCriticalIssues }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        void refetch();
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPhoto = async (file: File) => {
    setUploadingPhoto(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (photoRemarks.trim()) fd.append('remarks', photoRemarks.trim());
      const res = await fetch(`/api/projects/${projectId}/dpr/${dprId}/photos`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setPhotoRemarks('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        void refetch();
      } else {
        setError(data.error || 'Failed to upload photo');
      }
    } catch {
      setError('Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Remove this photo?')) return;
    const res = await fetch(`/api/projects/${projectId}/dpr/${dprId}/photos/${photoId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) void refetch();
    else setError(data.error || 'Failed to remove photo');
  };

  const handlePhotoCaption = async (photoId: string, remarks: string) => {
    const res = await fetch(`/api/projects/${projectId}/dpr/${dprId}/photos/${photoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remarks: remarks || null }),
    });
    const data = await res.json();
    if (!data.success) setError(data.error || 'Failed to save caption');
  };

  const handleImportExcel = async (file: File) => {
    setParsingExcel(true);
    setError('');
    setSaved(false);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true, bookFiles: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: false });
      const parsed = parseDprExcel(rows);

      // Build the next values directly from `parsed` (falling back to whatever's already on
      // screen) rather than reading back the `procurementRows`/etc. state — those setters
      // below won't have applied yet within this same function call, so relying on them here
      // would PATCH stale data.
      const nextProcurementRows = parsed.procurementRows.length > 0 ? parsed.procurementRows : procurementRows;
      const nextManpowerRows = parsed.manpowerRows.length > 0 ? parsed.manpowerRows : manpowerRows;
      const nextHighlights = parsed.highlights.length > 0 ? parsed.highlights.map((description) => ({ description })) : highlights;
      const nextCriticalIssues = parsed.criticalIssues || effectiveCriticalIssues;

      setProcurementRows(nextProcurementRows);
      setManpowerRows(nextManpowerRows);
      setHighlights(nextHighlights);
      setCriticalIssues(nextCriticalIssues);

      // Persist immediately — an import should behave like a completed save, not just fill
      // the form locally. Otherwise refreshing the page or downloading the PDF right after
      // importing silently loses everything, since the PDF is built from saved DB data.
      const saveRes = await fetch(`/api/projects/${projectId}/dpr/${dprId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procurementRows: nextProcurementRows,
          manpowerRows: nextManpowerRows,
          highlights: nextHighlights,
          criticalIssues: nextCriticalIssues,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveData.success) {
        setError(saveData.error || 'Imported the fields but failed to save them — click Save Draft to retry.');
      }

      const images = extractExcelImages(wb);
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const fd = new FormData();
        fd.append('file', new File([img.blob], img.fileName, { type: img.mimeType }));
        fd.append('remarks', `Imported photo ${i + 1}`);
        await fetch(`/api/projects/${projectId}/dpr/${dprId}/photos`, { method: 'POST', body: fd });
      }

      void refetch();
      if (saveData.success) setSaved(true);

      if (parsed.procurementRows.length === 0 && parsed.manpowerRows.length === 0 && parsed.highlights.length === 0 && !parsed.criticalIssues && images.length === 0) {
        setError('Could not find any recognizable DPR fields in that file.');
      }
    } catch {
      setError('Failed to read that Excel file.');
    } finally {
      setParsingExcel(false);
    }
  };

  const handleSign = async () => {
    if (!confirm('Sign this DPR? Once signed, it cannot be edited.')) return;
    setSigning(true);
    setError('');
    try {
      await handleSave();
      const res = await fetch(`/api/projects/${projectId}/dpr/${dprId}/sign`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        void refetch();
      } else {
        setError(data.error || 'Failed to sign');
      }
    } catch {
      setError('Failed to sign');
    } finally {
      setSigning(false);
    }
  };

  if (projectLoading || isLoading) return <Layout><TablePageSkeleton /></Layout>;
  if (!dpr) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="alert alert-error">DPR not found.</div>
      </Layout>
    );
  }

  const isSigned = dpr.status === 'SIGNED';
  const canFill = dpr.canFill;

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 pb-32 max-w-5xl">
        <Link href={`/projects/${projectId}/documents`} className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'rgba(232,228,220,0.5)' }}>
          <ArrowLeft className="w-3.5 h-3.5" />Back to Documents
        </Link>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Header */}
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-[#e8e4dc]">{dpr.docRefNo} · {formatDate(dpr.reportDate)}</h1>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.4)' }}>{dpr.projectName} · {dpr.clientName}</p>
            </div>
            <div className="flex items-center gap-2">
              {canFill && (
                <>
                  <input
                    ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={parsingExcel}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportExcel(f); e.target.value = ''; }}
                  />
                  <button
                    onClick={() => excelInputRef.current?.click()} disabled={parsingExcel}
                    className="btn btn-secondary flex items-center gap-2 disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />{parsingExcel ? 'Importing…' : 'Import Excel'}
                  </button>
                </>
              )}
              <a href={`/api/projects/${projectId}/dpr/${dprId}/pdf`} className="btn btn-secondary flex items-center gap-2">
                <Download className="w-4 h-4" />Download PDF
              </a>
            </div>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>Total Duration (days)</p>
                <p style={{ color: 'var(--ax-text)' }}>{dpr.duration?.totalDurationDays ?? 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>Elapsed (days)</p>
                <p style={{ color: 'var(--ax-text)' }}>{dpr.duration?.elapsedDays ?? 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>Balance (days)</p>
                <p style={{ color: 'var(--ax-text)' }}>{dpr.duration?.balanceDays ?? 'Not set'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Procurement */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold">Procurement Tracking</h2>
            {canFill && (
              <button onClick={() => setProcurementRows((p) => [...p, emptyProcurementRow()])} className="btn btn-secondary text-sm flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />Add row
              </button>
            )}
          </div>
          <div className="card-body p-0 overflow-x-auto">
            {procurementRows.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'rgba(232,228,220,0.4)' }}>No procurement items tracked.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                    {['Material', 'Description', 'Unit', 'Already Recd.', 'Recd. This Week', 'Cumm. Recd.', 'Consumed', 'Balance', 'Add’l Req.', ''].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {procurementRows.map((row, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      <td className="px-3 py-1.5"><input className="input text-sm" disabled={!canFill} value={row.materialName} onChange={(e) => setProcurementRows((p) => p.map((r, idx) => idx === i ? { ...r, materialName: e.target.value } : r))} /></td>
                      <td className="px-3 py-1.5"><input className="input text-sm" disabled={!canFill} value={row.description ?? ''} onChange={(e) => setProcurementRows((p) => p.map((r, idx) => idx === i ? { ...r, description: e.target.value } : r))} /></td>
                      <td className="px-3 py-1.5"><input className="input text-sm w-20" disabled={!canFill} value={row.unit} onChange={(e) => setProcurementRows((p) => p.map((r, idx) => idx === i ? { ...r, unit: e.target.value } : r))} /></td>
                      {(['alreadyReceived', 'receivedThisWeek', 'cumulativeReceivedTillDate', 'consumedTillDate', 'balanceAtSite'] as const).map((field) => (
                        <td key={field} className="px-3 py-1.5">
                          <input type="number" className="input text-sm w-24" disabled={!canFill} value={row[field]}
                            onChange={(e) => setProcurementRows((p) => p.map((r, idx) => idx === i ? { ...r, [field]: Number(e.target.value) || 0 } : r))} />
                        </td>
                      ))}
                      <td className="px-3 py-1.5"><input className="input text-sm" disabled={!canFill} value={row.additionalRequirement ?? ''} onChange={(e) => setProcurementRows((p) => p.map((r, idx) => idx === i ? { ...r, additionalRequirement: e.target.value } : r))} /></td>
                      <td className="px-3 py-1.5">
                        {canFill && (
                          <button onClick={() => setProcurementRows((p) => p.filter((_, idx) => idx !== i))} className="p-1 hover:text-[#e06050] transition-colors" style={{ color: 'rgba(232,228,220,0.3)' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Manpower */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold">Manpower — Actual vs Planned</h2>
            {canFill && (
              <button onClick={() => setManpowerRows((p) => [...p, emptyManpowerRow()])} className="btn btn-secondary text-sm flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />Add row
              </button>
            )}
          </div>
          <div className="card-body p-0 overflow-x-auto">
            {manpowerRows.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'rgba(232,228,220,0.4)' }}>No manpower recorded.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                    {['Vendor', 'Trade', 'Unit', 'Actual', 'Planned', ''].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {manpowerRows.map((row, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      <td className="px-3 py-1.5"><input className="input text-sm" disabled={!canFill} value={row.vendorName} onChange={(e) => setManpowerRows((p) => p.map((r, idx) => idx === i ? { ...r, vendorName: e.target.value } : r))} placeholder="e.g. Vanbros — Civil+Interior" /></td>
                      <td className="px-3 py-1.5"><input className="input text-sm" disabled={!canFill} value={row.tradeName} onChange={(e) => setManpowerRows((p) => p.map((r, idx) => idx === i ? { ...r, tradeName: e.target.value } : r))} placeholder="e.g. Mason" /></td>
                      <td className="px-3 py-1.5"><input className="input text-sm w-20" disabled={!canFill} value={row.unit} onChange={(e) => setManpowerRows((p) => p.map((r, idx) => idx === i ? { ...r, unit: e.target.value } : r))} placeholder="Each" /></td>
                      <td className="px-3 py-1.5"><input type="number" className="input text-sm w-20" disabled={!canFill} value={row.actualCount} onChange={(e) => setManpowerRows((p) => p.map((r, idx) => idx === i ? { ...r, actualCount: Number(e.target.value) || 0 } : r))} /></td>
                      <td className="px-3 py-1.5"><input type="number" className="input text-sm w-20" disabled={!canFill} value={row.plannedCount} onChange={(e) => setManpowerRows((p) => p.map((r, idx) => idx === i ? { ...r, plannedCount: Number(e.target.value) || 0 } : r))} /></td>
                      <td className="px-3 py-1.5">
                        {canFill && (
                          <button onClick={() => setManpowerRows((p) => p.filter((_, idx) => idx !== i))} className="p-1 hover:text-[#e06050] transition-colors" style={{ color: 'rgba(232,228,220,0.3)' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Highlights */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold">Day&apos;s Highlights</h2>
            {canFill && (
              <button onClick={() => setHighlights((p) => [...p, { description: '' }])} className="btn btn-secondary text-sm flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />Add
              </button>
            )}
          </div>
          <div className="card-body space-y-2">
            {highlights.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No highlights recorded.</p>
            ) : (
              highlights.map((h, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-sm w-6 shrink-0" style={{ color: 'rgba(232,228,220,0.4)' }}>{i + 1}.</span>
                  <input className="input text-sm flex-1" disabled={!canFill} value={h.description} onChange={(e) => setHighlights((p) => p.map((v, idx) => idx === i ? { description: e.target.value } : v))} />
                  {canFill && (
                    <button onClick={() => setHighlights((p) => p.filter((_, idx) => idx !== i))} className="p-1 hover:text-[#e06050] transition-colors" style={{ color: 'rgba(232,228,220,0.3)' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Critical Issues — separate from Day's Highlights, for flagging urgent/blocking
        issues that need PMC/Client attention, not routine progress notes. */}
        <div className="card" style={{ borderColor: effectiveCriticalIssues ? 'rgba(224,96,80,0.35)' : undefined }}>
          <div className="card-header flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: '#e06050' }} />
            <h2 className="font-semibold">Critical Issues</h2>
          </div>
          <div className="card-body">
            <textarea
              className="input" rows={3}
              placeholder="Any critical or blocking issues that need PMC/Client attention today (e.g. safety concerns, material shortages, access blockers)…"
              value={effectiveCriticalIssues}
              disabled={!canFill}
              onChange={(e) => setCriticalIssues(e.target.value)}
            />
          </div>
        </div>

        {/* Site Photos */}
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <Camera className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
            <h2 className="font-semibold">Site Photos ({dpr.photos.length})</h2>
          </div>
          <div className="card-body space-y-4">
            {canFill && (
              <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg" style={{ background: 'var(--ax-overlay-hover)' }}>
                <div className="flex-1 min-w-[200px]">
                  <label className="label text-xs">Caption (optional)</label>
                  <input
                    type="text" className="input text-sm"
                    placeholder="e.g. Ground floor slab dismantling — north side"
                    value={photoRemarks}
                    onChange={(e) => setPhotoRemarks(e.target.value)}
                  />
                </div>
                <input
                  ref={fileInputRef}
                  type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  disabled={uploadingPhoto}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadPhoto(f); }}
                  className="text-sm"
                  style={{ color: 'rgba(232,228,220,0.6)' }}
                />
                {uploadingPhoto && <span className="text-xs" style={{ color: 'rgba(232,228,220,0.4)' }}>Uploading…</span>}
              </div>
            )}

            {dpr.photos.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No photos attached yet.</p>
            ) : (
              <div className="space-y-3">
                {dpr.photos.map((photo) => (
                  <div key={photo.id} className="flex items-stretch gap-3 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--ax-border)' }}>
                    <div className="flex-1 min-w-0 p-3 flex flex-col justify-between gap-2">
                      <input
                        type="text" className="input text-sm" placeholder="Add a caption…"
                        defaultValue={photo.remarks ?? ''}
                        disabled={!canFill}
                        onBlur={(e) => { if (e.target.value !== (photo.remarks ?? '')) void handlePhotoCaption(photo.id, e.target.value); }}
                      />
                      {canFill && (
                        <button
                          onClick={() => void handleDeletePhoto(photo.id)}
                          className="self-start text-xs flex items-center gap-1 py-1 rounded hover:text-[#e06050] transition-colors"
                          style={{ color: 'rgba(232,228,220,0.4)' }}
                        >
                          <Trash2 className="w-3 h-3" />Remove
                        </button>
                      )}
                    </div>
                    <img
                      src={`/api/projects/${projectId}/dpr/${dprId}/photos/${photo.id}`}
                      alt={photo.remarks ?? photo.fileName}
                      className="w-40 h-28 object-cover shrink-0"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Save / Sign */}
        <div className="card">
          <div className="card-body flex items-center justify-between flex-wrap gap-3">
            {isSigned ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#5cba80' }}>
                <CheckCircle2 className="w-4 h-4" />
                Signed by {dpr.signedBy?.name} · {formatDateTime(dpr.signedAt)}
              </div>
            ) : canFill ? (
              <div className="flex items-center gap-3">
                <button onClick={() => void handleSave()} disabled={saving} className="btn btn-secondary disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
                <button onClick={() => void handleSign()} disabled={signing} className="btn btn-primary disabled:opacity-50">
                  {signing ? 'Signing…' : 'Sign & Submit'}
                </button>
                {saved && <span className="text-sm" style={{ color: '#5cba80' }}>Saved</span>}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>This DPR is view-only for your role.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
