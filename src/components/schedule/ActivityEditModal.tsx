'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { X, Save, Send, History } from 'lucide-react';
import DependencyManager from '@/components/milestones/DependencyManager';
import MilestoneTimeline from '@/components/milestones/MilestoneTimeline';
import ActivityStateBadge from '@/components/ActivityStateBadge';
import HierarchicalSelect from '@/components/ui/HierarchicalSelect';
import { buildPhaseOptions, isPurchaseOrderPhase, type SchedulePhaseOption } from '@/lib/phaseHierarchy';
import { jsonFetcher } from '@/lib/fetcher';

const PRIORITY_OPTIONS = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

interface EditableActivity {
  id: string;
  title: string;
  state: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  baselinePlannedStart: string | null;
  baselinePlannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  durationDays: number | null;
  percentComplete: number | null;
  actualWorkHours: number | null;
  remainingWorkHours: number | null;
  phaseId: string | null;
  vendorUserId: string | null;
  // Optional: the Schedule page's edit entry point doesn't fetch these (its list endpoint is
  // out of scope for this change), so they're absent there and Priority/Remarks just show
  // their defaults in that context — only the Activities page's own edit flow reliably has them.
  priority?: string;
  remarks?: string | null;
}

interface VendorOption {
  userId: string | null;
  name: string;
  email: string;
  isPendingInvite: boolean;
}
interface ScheduleForPhases { phases: SchedulePhaseOption[] }

interface ActivityHistory {
  submissions: import('@/components/milestones/MilestoneTimeline').TimelineSubmission[];
  verifications: import('@/components/milestones/MilestoneTimeline').TimelineVerification[];
  comments: import('@/components/milestones/MilestoneTimeline').TimelineComment[];
  transitions: import('@/components/milestones/MilestoneTimeline').TimelineTransition[];
}

function toDateInput(v: string | null): string {
  return v ? v.slice(0, 10) : '';
}

/** Edit modal for an activity — full MS Project field set (planned/baseline/actual dates,
 * duration, % complete, work hours) plus Priority, Remarks, Linked Phase, Assigned Vendor, and
 * a read-only Evidence/Comments/Verification History timeline (same data + component as the
 * full activity detail page, so this panel doubles as a quick-look without navigating away). */
export default function ActivityEditModal({
  projectId,
  milestone,
  canEdit,
  onClose,
  onSaved,
}: {
  projectId: string;
  milestone: EditableActivity;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(milestone.title);
  const [plannedStart, setPlannedStart] = useState(toDateInput(milestone.plannedStart));
  const [plannedEnd, setPlannedEnd] = useState(toDateInput(milestone.plannedEnd));
  const [baselinePlannedStart, setBaselinePlannedStart] = useState(toDateInput(milestone.baselinePlannedStart));
  const [baselinePlannedEnd, setBaselinePlannedEnd] = useState(toDateInput(milestone.baselinePlannedEnd));
  const [actualStart, setActualStart] = useState(toDateInput(milestone.actualStart));
  const [actualEnd, setActualEnd] = useState(toDateInput(milestone.actualEnd));
  const [durationDays, setDurationDays] = useState(milestone.durationDays?.toString() ?? '');
  const [actualWorkHours, setActualWorkHours] = useState(milestone.actualWorkHours?.toString() ?? '');
  const [remainingWorkHours, setRemainingWorkHours] = useState(milestone.remainingWorkHours?.toString() ?? '');
  const [phaseId, setPhaseId] = useState(milestone.phaseId ?? '');
  const [vendorUserId, setVendorUserId] = useState(milestone.vendorUserId ?? '');
  const [priority, setPriority] = useState(milestone.priority ?? 'NORMAL');
  const [remarks, setRemarks] = useState(milestone.remarks ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const { data: vendorsPayload, isLoading: vendorsLoading } = useSWR<VendorOption[]>(
    canEdit && projectId ? `/api/admin/vendors?projectId=${projectId}` : null,
    jsonFetcher,
  );
  const vendors = (vendorsPayload ?? []).filter((v) => !v.isPendingInvite && v.userId);

  const { data: scheduleForPhases } = useSWR<ScheduleForPhases>(
    canEdit && projectId ? `/api/projects/${projectId}/schedule` : null,
    jsonFetcher,
  );
  // Purchase Orders are a separate concept — only Execution/schedule phases are linkable here.
  const phaseOptions = buildPhaseOptions((scheduleForPhases?.phases ?? []).filter((p) => !isPurchaseOrderPhase(p)));

  const {
    data: history,
    isLoading: historyLoading,
    mutate: refetchHistory,
  } = useSWR<ActivityHistory>(
    projectId && milestone.id ? `/api/projects/${projectId}/milestones/${milestone.id}` : null,
    jsonFetcher,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestone.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          plannedStart: plannedStart || null,
          plannedEnd: plannedEnd || null,
          baselinePlannedStart: baselinePlannedStart || null,
          baselinePlannedEnd: baselinePlannedEnd || null,
          actualStart: actualStart || null,
          actualEnd: actualEnd || null,
          durationDays: durationDays === '' ? null : Number(durationDays),
          actualWorkHours: actualWorkHours === '' ? null : Number(actualWorkHours),
          remainingWorkHours: remainingWorkHours === '' ? null : Number(remainingWorkHours),
          phaseId: phaseId || null,
          vendorUserId: vendorUserId || null,
          priority,
          remarks: remarks.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        setError(data.error ?? 'Failed to save activity');
      }
    } catch {
      setError('Failed to save activity');
    } finally {
      setSaving(false);
    }
  };

  const handlePostComment = async () => {
    if (!commentBody.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestone.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCommentBody('');
        void refetchHistory();
      } else {
        setError(data.error ?? 'Failed to post comment');
      }
    } catch {
      setError('Failed to post comment');
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">{canEdit ? 'Edit Activity' : 'Activity Details'}</h2>
              <ActivityStateBadge state={milestone.state as any} />
            </div>
            <button onClick={onClose} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && <div className="alert alert-error text-sm">{error}</div>}

          <div>
            <label className="label text-xs">Activity Name</label>
            <input
              type="text" className="input text-sm" value={title}
              onChange={(e) => setTitle(e.target.value)} disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Linked Phase</label>
              <HierarchicalSelect
                value={phaseId}
                onChange={setPhaseId}
                disabled={!canEdit}
                fixedOptions={[{ value: '', label: 'Unphased', depth: 0 }]}
                treeOptions={phaseOptions.map((p) => ({ value: p.id, label: p.name, depth: p.depth }))}
              />
            </div>
            <div>
              <label className="label text-xs">Assigned Vendor</label>
              <select className="input text-sm" value={vendorUserId} onChange={(e) => setVendorUserId(e.target.value)} disabled={!canEdit || vendorsLoading}>
                <option value="">Unassigned</option>
                {vendors.map((v) => (
                  <option key={v.userId} value={v.userId!}>{v.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Priority</label>
              <select className="input text-sm" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={!canEdit}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label text-xs">Remarks</label>
            <textarea
              rows={2}
              className="input text-sm resize-none"
              placeholder="e.g. Waiting on client sign-off before starting…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Planned Start</label>
              <input type="date" className="input text-sm" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <label className="label text-xs">Planned Finish</label>
              <input type="date" className="input text-sm" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <label className="label text-xs">Baseline Start</label>
              <input type="date" className="input text-sm" value={baselinePlannedStart} onChange={(e) => setBaselinePlannedStart(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <label className="label text-xs">Baseline Finish</label>
              <input type="date" className="input text-sm" value={baselinePlannedEnd} onChange={(e) => setBaselinePlannedEnd(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <label className="label text-xs">Actual Start</label>
              <input type="date" className="input text-sm" value={actualStart} onChange={(e) => setActualStart(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <label className="label text-xs">Actual Finish</label>
              <input type="date" className="input text-sm" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs">Duration (days)</label>
              <input type="number" step="0.01" className="input text-sm" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <label className="label text-xs">Actual Work (h)</label>
              <input type="number" step="0.5" className="input text-sm" value={actualWorkHours} onChange={(e) => setActualWorkHours(e.target.value)} disabled={!canEdit} />
            </div>
            <div>
              <label className="label text-xs">Remaining Work (h)</label>
              <input type="number" step="0.5" className="input text-sm" value={remainingWorkHours} onChange={(e) => setRemainingWorkHours(e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          <DependencyManager projectId={projectId} milestoneId={milestone.id} canEdit={canEdit} />

          {canEdit && (
            <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.07)]">
              <button onClick={onClose} className="btn btn-secondary text-sm">Cancel</button>
              <button onClick={() => void handleSave()} disabled={saving} className="btn btn-primary text-sm disabled:opacity-50 inline-flex items-center gap-1.5">
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}

          {/* Evidence / Comments / Verification History — same timeline the full detail page uses */}
          <div className="pt-4 border-t border-[rgba(255,255,255,0.07)]">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-[var(--ax-accent)]" />
              <h3 className="text-sm font-semibold text-[#e8e4dc]">Evidence, Comments &amp; Verification History</h3>
            </div>
            {historyLoading ? (
              <p className="text-sm text-[rgba(232,228,220,0.35)] text-center py-4">Loading activity…</p>
            ) : (
              <MilestoneTimeline
                submissions={history?.submissions ?? []}
                verifications={history?.verifications ?? []}
                comments={history?.comments ?? []}
                transitions={history?.transitions ?? []}
              />
            )}
            {canEdit && (
              <div className="pt-4 mt-4 border-t border-[rgba(255,255,255,0.06)] flex items-end gap-2">
                <textarea
                  rows={1}
                  className="input resize-none text-sm flex-1"
                  placeholder="Add a comment…"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (commentBody.trim()) void handlePostComment();
                    }
                  }}
                />
                <button
                  onClick={() => void handlePostComment()}
                  disabled={postingComment || !commentBody.trim()}
                  className="btn btn-secondary text-sm shrink-0 disabled:opacity-50 px-3"
                  aria-label="Post comment"
                >
                  {postingComment ? '…' : <Send className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
