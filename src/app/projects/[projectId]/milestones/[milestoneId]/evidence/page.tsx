'use client';

import { ListPageSkeleton } from '@/components/ui/SkeletonPage';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface MilestonePayload {
  title: string;
  state: string;
  permissions: { canSubmitEvidence?: boolean };
}

function FileItem({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const isImage = file.type.startsWith('image/');
  const isPDF = file.type === 'application/pdf';
  const sizeKB = Math.round(file.size / 1024);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
      {isImage && preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={file.name} className="w-12 h-12 object-cover rounded shrink-0" />
      ) : isPDF ? (
        <div className="w-12 h-12 flex items-center justify-center rounded bg-[rgba(220,53,69,0.15)] border border-[rgba(220,53,69,0.3)] shrink-0">
          <span className="text-[#e06050] text-xs font-bold">PDF</span>
        </div>
      ) : (
        <div className="w-12 h-12 flex items-center justify-center rounded bg-[rgba(255,255,255,0.06)] shrink-0">
          <span className="text-[rgba(232,228,220,0.55)] text-xs">FILE</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#e8e4dc] truncate">{file.name}</p>
        <p className="text-xs text-[rgba(232,228,220,0.45)]">{sizeKB} KB</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-[rgba(232,228,220,0.35)] hover:text-[#e06050] transition-colors text-lg leading-none shrink-0"
      >
        ×
      </button>
    </div>
  );
}

export default function SubmitEvidencePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const milestoneId = params.milestoneId as string;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [percent, setPercent] = useState(100);
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const { data: milestone, isLoading: msLoading } = useSWR<MilestonePayload>(
    projectId && milestoneId
      ? `/api/projects/${projectId}/milestones/${milestoneId}`
      : null,
    jsonFetcher,
    { dedupingInterval: 5_000 },
  );

  const loading = projectLoading || msLoading;

  useEffect(() => {
    if (!milestone) return;
    if (milestone.state !== 'IN_PROGRESS') {
      setError('Evidence can only be submitted when milestone is In Progress');
    } else if (!milestone.permissions?.canSubmitEvidence) {
      setError('You do not have permission to submit evidence');
    }
  }, [milestone]);

  const addFiles = (incoming: File[]) => {
    const valid = incoming.filter(
      (f) => f.type.startsWith('image/') || f.type === 'application/pdf',
    );
    if (valid.length < incoming.length) {
      setError('Only images and PDFs are accepted');
    }
    setFiles((prev) => [...prev, ...valid]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) { setError('At least one file is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('qtyOrPercent', String(percent));
      if (remarks.trim()) fd.append('remarks', remarks.trim());
      files.forEach((f) => fd.append('files', f));

      const res = await fetch(
        `/api/projects/${projectId}/milestones/${milestoneId}/evidence`,
        { method: 'POST', body: fd },
      );
      const data = await res.json();
      if (data.success) {
        router.push(`/projects/${projectId}/milestones/${milestoneId}`);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to submit evidence');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Layout><ListPageSkeleton /></Layout>;

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Submit Evidence</h1>
          <p className="text-[rgba(232,228,220,0.55)] mt-1">{milestone?.title}</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Percentage of work */}
          <div className="card">
            <div className="card-body space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[#e8e4dc]">Work Completion</h2>
                <span className="text-2xl font-bold text-[#c4a35a]">{percent}%</span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                className="w-full accent-[#c4a35a]"
              />

              {/* Visual bar */}
              <div className="h-2 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${percent}%`,
                    background: percent >= 80
                      ? '#5cba80'
                      : percent >= 40
                      ? '#c4a35a'
                      : '#e06050',
                  }}
                />
              </div>

              {/* Quick picks */}
              <div className="flex gap-2 flex-wrap">
                {[25, 50, 75, 100].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPercent(v)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      percent === v
                        ? 'border-[#c4a35a] bg-[rgba(196,163,90,0.15)] text-[#c4a35a]'
                        : 'border-[rgba(255,255,255,0.1)] text-[rgba(232,228,220,0.55)] hover:border-[rgba(196,163,90,0.4)]'
                    }`}
                  >
                    {v}%
                  </button>
                ))}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="input py-0.5 px-2 text-sm w-20"
                />
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="card">
            <div className="card-body space-y-2">
              <h2 className="text-base font-semibold text-[#e8e4dc]">Remarks</h2>
              <textarea
                rows={3}
                className="input resize-none w-full"
                placeholder="Describe the work done, any observations or notes for the PMC…"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>

          {/* File upload */}
          <div className="card">
            <div className="card-body space-y-4">
              <h2 className="text-base font-semibold text-[#e8e4dc]">
                Attachments <span className="text-[#e06050]">*</span>
              </h2>
              <p className="text-xs text-[rgba(232,228,220,0.45)]">
                Upload photos or PDF reports as proof of work. Images and PDFs only, up to 10 MB each.
              </p>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragging
                    ? 'border-[#c4a35a] bg-[rgba(196,163,90,0.08)]'
                    : 'border-[rgba(255,255,255,0.12)] hover:border-[rgba(196,163,90,0.4)] hover:bg-[rgba(255,255,255,0.02)]'
                }`}
              >
                <div className="text-3xl mb-2 text-[rgba(232,228,220,0.3)]">📎</div>
                <p className="text-sm font-medium text-[rgba(232,228,220,0.7)]">
                  {dragging ? 'Drop files here' : 'Click to browse or drag & drop'}
                </p>
                <p className="text-xs text-[rgba(232,228,220,0.4)] mt-1">PNG, JPG, PDF</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
              />

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((file, i) => (
                    <FileItem key={i} file={file} onRemove={() => setFiles((p) => p.filter((_, j) => j !== i))} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(196,163,90,0.06)] border border-[rgba(196,163,90,0.15)]">
            <span className="text-[#c4a35a] mt-0.5">⚠</span>
            <p className="text-xs text-[rgba(232,228,220,0.6)]">
              Evidence is locked after submission. Ensure all files are correct before proceeding.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => router.back()} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || files.length === 0}
              className="btn btn-primary disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Evidence'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
