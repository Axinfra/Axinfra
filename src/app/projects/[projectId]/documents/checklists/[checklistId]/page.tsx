'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Download, CheckCircle2 } from 'lucide-react';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDateTime } from '@/lib/utils';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';

interface ChecklistItemDetail {
  id: string;
  sortOrder: number;
  description: string;
  result: 'OK' | 'NOT_OK' | 'NA' | null;
  remarks: string | null;
}

interface ChecklistDetail {
  id: string;
  title: string;
  docRefNo: string;
  referenceDrawingNo: string;
  status: string;
  certificationRemarks: string | null;
  signedAt: string | null;
  signedBy: { name: string } | null;
  createdBy: { name: string };
  createdAt: string;
  projectName: string;
  clientName: string;
  location: string | null;
  items: ChecklistItemDetail[];
  canFill: boolean;
  canSign: boolean;
}

// Same semantic palette used everywhere else in the app for status (verified/error/neutral
// tones — e.g. LIFECYCLE_COLOR, StatCard), not generic browser radio blue.
const RESULT_OPTIONS: Array<{ value: 'OK' | 'NOT_OK' | 'NA'; label: string; color: string }> = [
  { value: 'OK', label: 'O.K.', color: '#5cba80' },
  { value: 'NOT_OK', label: 'Not O.K.', color: '#e06050' },
  { value: 'NA', label: 'N.A.', color: 'rgba(232,228,220,0.5)' },
];

export default function ChecklistDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const checklistId = params.checklistId as string;
  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const { data: checklist, isLoading, mutate: refetch } = useSWR<ChecklistDetail>(
    `/api/projects/${projectId}/checklists/${checklistId}`,
    jsonFetcher,
  );

  const [certRemarks, setCertRemarks] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');

  const effectiveCertRemarks = certRemarks ?? checklist?.certificationRemarks ?? '';

  // Optimistic: update the local SWR cache immediately so a click/type feels instant, fire the
  // PATCH in the background, and only re-fetch from the server to roll back if it fails —
  // previously this awaited the PATCH response before touching the UI at all, which meant every
  // click paid for a full network round-trip before the radio even appeared selected.
  const handleItemChange = (itemId: string, result: 'OK' | 'NOT_OK' | 'NA', remarks: string | null) => {
    setError('');
    void refetch(
      (current) => current && {
        ...current,
        items: current.items.map((i) => (i.id === itemId ? { ...i, result, remarks } : i)),
      },
      { revalidate: false },
    );
    fetch(`/api/projects/${projectId}/checklists/${checklistId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result, remarks }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          setError(data.error || 'Failed to save');
          void refetch();
        }
      })
      .catch(() => {
        setError('Failed to save');
        void refetch();
      });
  };

  const handleSign = async () => {
    if (!confirm('Sign this checklist? Once signed, it cannot be edited.')) return;
    setSigning(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/checklists/${checklistId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificationRemarks: effectiveCertRemarks }),
      });
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
  if (!checklist) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="alert alert-error">Checklist not found.</div>
      </Layout>
    );
  }

  const allFilled = checklist.items.length > 0 && checklist.items.every((i) => i.result !== null);
  const isSigned = checklist.status === 'SIGNED';

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 pb-32 max-w-4xl">
        <Link href={`/projects/${projectId}/documents`} className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'rgba(232,228,220,0.5)' }}>
          <ArrowLeft className="w-3.5 h-3.5" />Back to Documents
        </Link>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Header */}
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-[#e8e4dc]">{checklist.docRefNo} · {checklist.title}</h1>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.4)' }}>
                Created by {checklist.createdBy.name}
              </p>
            </div>
            <a href={`/api/projects/${projectId}/checklists/${checklistId}/pdf`} className="btn btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />Download PDF
            </a>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>Project</p>
                <p style={{ color: 'var(--ax-text)' }}>{checklist.projectName}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>Client</p>
                <p style={{ color: 'var(--ax-text)' }}>{checklist.clientName}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>Location</p>
                <p style={{ color: 'var(--ax-text)' }}>{checklist.location ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>Reference Drawing No.</p>
                <p style={{ color: 'var(--ax-text)' }}>{checklist.referenceDrawingNo}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Check points */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Check List</h2>
          </div>
          <div className="card-body p-0">
            <div className="divide-y" style={{ borderColor: 'var(--ax-border-subtle)' }}>
              {checklist.items.map((item) => (
                <div key={item.id} className="px-5 py-4 space-y-2">
                  <p className="text-sm font-medium" style={{ color: 'var(--ax-text)' }}>{item.description}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {RESULT_OPTIONS.map((opt) => {
                      const selected = item.result === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={!checklist.canFill}
                          onClick={() => handleItemChange(item.id, opt.value, item.remarks)}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                          style={selected
                            ? { background: `${opt.color}22`, borderColor: opt.color, color: opt.color }
                            : { background: 'transparent', borderColor: 'var(--ax-border)', color: 'rgba(232,228,220,0.55)' }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    className="input text-sm"
                    placeholder="Remarks"
                    defaultValue={item.remarks ?? ''}
                    disabled={!checklist.canFill || item.result === null}
                    onBlur={(e) => {
                      if (item.result) void handleItemChange(item.id, item.result, e.target.value || null);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Certification / Sign */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Certification / Remarks</h2>
          </div>
          <div className="card-body space-y-4">
            <textarea
              className="input" rows={3}
              placeholder="Certification / Remarks by Site Engineer"
              value={effectiveCertRemarks}
              disabled={!checklist.canFill}
              onChange={(e) => setCertRemarks(e.target.value)}
            />
            {isSigned ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#5cba80' }}>
                <CheckCircle2 className="w-4 h-4" />
                Signed by {checklist.signedBy?.name} · {formatDateTime(checklist.signedAt)}
              </div>
            ) : checklist.canSign ? (
              <button onClick={() => void handleSign()} disabled={!allFilled || signing} className="btn btn-primary disabled:opacity-50">
                {signing ? 'Signing…' : 'Sign & Submit'}
              </button>
            ) : null}
            {!isSigned && !allFilled && checklist.canFill && (
              <p className="text-xs" style={{ color: 'rgba(232,228,220,0.4)' }}>Every check point must be marked before signing.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
