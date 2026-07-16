'use client';

import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { Badge } from '@/components/ui/Badge';
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Download, ExternalLink, HelpCircle, ChevronDown,
  Folder, Diamond, ListTodo,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { computeCPM, milestonesCpmInputs } from '@/lib/cpm';
import WbsTree, { type WbsPhase, type WbsMilestone } from '@/components/schedule/WbsTree';
import ActivityEditModal from '@/components/schedule/ActivityEditModal';
import PhaseEditModal from '@/components/schedule/PhaseEditModal';

interface SchedulePhase {
  id: string; name: string; description: string | null; sortOrder: number; parentPhaseId: string | null; outlineLevel: number | null;
  plannedStart: string | null; plannedEnd: string | null;
  vendorUserId: string | null; vendorUser: { name: string } | null;
}
interface ScheduleMilestone {
  id: string; title: string; state: string; sortOrder: number; phaseId: string | null;
  plannedStart: string | null; plannedEnd: string | null;
  actualStart: string | null; actualEnd: string | null;
  baselinePlannedStart: string | null; baselinePlannedEnd: string | null;
  wbsCode: string | null; outlineLevel: number | null; isMsProjectMilestone: boolean | null;
  durationDays: number | null; percentComplete: number | null;
  actualWorkHours: number | null; remainingWorkHours: number | null;
  value: number; vendorUserId: string | null; vendorUser: { name: string } | null;
  predecessorDependencies: Array<{ predecessorId: string; dependencyType: string; lagDays: number }>;
  resourceAssignments: Array<{ units: number; workHours: number | null; resource: { id: string; name: string; type: string | null } }>;
}
interface ScheduleData {
  phases: SchedulePhase[];
  milestones: ScheduleMilestone[];
  latestConfirmedImport: { id: string; fileName: string; confirmedAt: string; sourceFormat: string } | null;
}
interface ImportPreview {
  id: string; status: string; fileName: string;
  phasesFound: number; milestonesFound: number; dependenciesFound: number; resourcesFound: number;
  errorMessage: string | null;
  wrapperPhaseCandidate: { name: string; wbsCode: string } | null;
}

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'destructive' | 'neutral'; label: string }> = {
  PENDING: { variant: 'neutral', label: 'Pending' },
  PARSING: { variant: 'warning', label: 'Parsing…' },
  PARSED: { variant: 'warning', label: 'Awaiting confirmation' },
  FAILED: { variant: 'destructive', label: 'Failed' },
  CONFIRMED: { variant: 'success', label: 'Confirmed' },
};

export default function SchedulePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [keepWrapperPhase, setKeepWrapperPhase] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const canUpload = myRole === 'PMC';
  const canEditMilestones = myRole === 'PMC' || myRole === 'CLIENT';

  const { data: schedule, isLoading: scheduleLoading, mutate: refetchSchedule } = useSWR<ScheduleData>(
    projectId ? `/api/projects/${projectId}/schedule` : null,
    jsonFetcher,
  );

  const loading = projectLoading || scheduleLoading;

  const handleFile = async (file: File) => {
    setUploadError('');
    setUploading(true);
    setPreview(null);
    setKeepWrapperPhase(false);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const res = await fetch(`/api/projects/${projectId}/schedule/import`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
      } else {
        setUploadError(data.error ?? 'Failed to import file');
      }
    } catch {
      setUploadError('Failed to import file');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule/import/${preview.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepWrapperPhase }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(null);
        void refetchSchedule();
      } else {
        setUploadError(data.error ?? 'Failed to confirm import');
      }
    } catch {
      setUploadError('Failed to confirm import');
    } finally {
      setConfirming(false);
    }
  };

  // ── Critical path (CPM computed client-side) — drives the "critical" highlight in the WBS Tree ──
  const criticalIds = useMemo(() => {
    if (!schedule) return new Set<string>();

    const cpmInputs = milestonesCpmInputs(
      schedule.milestones.map((m) => ({
        id: m.id, title: m.title,
        plannedStart: m.plannedStart ? new Date(m.plannedStart) : null,
        plannedEnd: m.plannedEnd ? new Date(m.plannedEnd) : null,
        sortOrder: m.sortOrder,
        predecessorIds: m.predecessorDependencies.map((d) => d.predecessorId),
      })),
      schedule.milestones.find((m) => m.plannedStart)?.plannedStart ? new Date(schedule.milestones.find((m) => m.plannedStart)!.plannedStart!) : new Date(),
    );
    const lagMap = new Map<string, number>();
    for (const m of schedule.milestones) {
      for (const dep of m.predecessorDependencies) lagMap.set(`${dep.predecessorId}→${m.id}`, dep.lagDays);
    }
    const cpmResult = computeCPM(cpmInputs, lagMap);
    return new Set(cpmResult.criticalPath);
  }, [schedule]);

  const { wbsPhases, unphasedMilestones } = useMemo(() => {
    if (!schedule) return { wbsPhases: [] as WbsPhase[], unphasedMilestones: [] as WbsMilestone[] };
    const byPhase = new Map<string | null, ScheduleMilestone[]>();
    for (const m of schedule.milestones) {
      const list = byPhase.get(m.phaseId) ?? [];
      list.push(m);
      byPhase.set(m.phaseId, list);
    }
    const toWbsMilestone = (m: ScheduleMilestone): WbsMilestone => ({ ...m, isCritical: criticalIds.has(m.id) });
    const phases: WbsPhase[] = schedule.phases.map((p) => ({
      id: p.id, name: p.name, parentPhaseId: p.parentPhaseId, outlineLevel: p.outlineLevel, sortOrder: p.sortOrder,
      milestones: (byPhase.get(p.id) ?? []).map(toWbsMilestone),
    }));
    return { wbsPhases: phases, unphasedMilestones: (byPhase.get(null) ?? []).map(toWbsMilestone) };
  }, [schedule, criticalIds]);

  const resourceSummary = useMemo(() => {
    if (!schedule) return [];
    const byResource = new Map<string, { name: string; type: string | null; count: number }>();
    for (const m of schedule.milestones) {
      for (const a of m.resourceAssignments) {
        const entry = byResource.get(a.resource.id) ?? { name: a.resource.name, type: a.resource.type, count: 0 };
        entry.count++;
        byResource.set(a.resource.id, entry);
      }
    }
    return Array.from(byResource.values());
  }, [schedule]);

  const editingMilestone = editingMilestoneId ? schedule?.milestones.find((m) => m.id === editingMilestoneId) ?? null : null;
  const editingPhase = editingPhaseId ? schedule?.phases.find((p) => p.id === editingPhaseId) ?? null : null;

  if (loading) return <Layout><TablePageSkeleton /></Layout>;

  const hasSchedule = (schedule?.phases.length ?? 0) > 0 || (schedule?.milestones.length ?? 0) > 0;

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#e8e4dc]">Schedule</h1>
            <p className="text-[rgba(232,228,220,0.55)] mt-1 text-sm">
              Imported from Microsoft Project — WBS, Gantt, dependencies, and progress.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasSchedule && (
              <>
                <a href={`/api/projects/${projectId}/schedule/export`} className="btn btn-secondary text-sm inline-flex items-center gap-1.5">
                  <Download className="w-4 h-4" /> Export Excel
                </a>
                <a href={`/api/projects/${projectId}/schedule/export-xml`} className="btn btn-secondary text-sm inline-flex items-center gap-1.5">
                  <Download className="w-4 h-4" /> Export MS Project XML
                </a>
              </>
            )}
          </div>
        </div>

        {/* Upload zone — PMC only */}
        {canUpload && (
          <div className="card">
            <div className="card-body space-y-4">
              {uploadError && <div className="alert alert-error text-sm">{uploadError}</div>}

              {preview ? (
                <div className="rounded-lg border border-[rgba(var(--ax-accent-rgb),0.3)] bg-[rgba(var(--ax-accent-rgb),0.06)] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--ax-accent)]" />
                    <span className="text-sm font-medium text-[#e8e4dc]">{preview.fileName}</span>
                    {STATUS_BADGE[preview.status] && <Badge variant={STATUS_BADGE[preview.status].variant}>{STATUS_BADGE[preview.status].label}</Badge>}
                  </div>
                  {preview.status === 'FAILED' ? (
                    <p className="text-sm text-[#e06050]">{preview.errorMessage}</p>
                  ) : (
                    <>
                      <div className="flex gap-6 text-sm text-[rgba(232,228,220,0.7)]">
                        <span><strong className="text-[#e8e4dc]">{preview.phasesFound}</strong> phases</span>
                        <span><strong className="text-[#e8e4dc]">{preview.milestonesFound}</strong> tasks/milestones</span>
                        <span><strong className="text-[#e8e4dc]">{preview.dependenciesFound}</strong> dependencies</span>
                        <span><strong className="text-[#e8e4dc]">{preview.resourcesFound}</strong> resources</span>
                      </div>

                      {preview.wrapperPhaseCandidate && (
                        <div className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] p-4 space-y-2.5">
                          <p className="text-sm text-[#e8e4dc]">
                            We found <strong>&quot;{preview.wrapperPhaseCandidate.name}&quot;</strong> as a single top-level task spanning your whole schedule.
                          </p>
                          <div className="space-y-2">
                            <label className="flex items-start gap-2.5 text-sm text-[rgba(232,228,220,0.8)] cursor-pointer">
                              <input
                                type="radio"
                                name="wrapperPhaseChoice"
                                checked={!keepWrapperPhase}
                                onChange={() => setKeepWrapperPhase(false)}
                                className="mt-0.5"
                              />
                              It&apos;s just my project&apos;s name — leave it out
                            </label>
                            <label className="flex items-start gap-2.5 text-sm text-[rgba(232,228,220,0.8)] cursor-pointer">
                              <input
                                type="radio"
                                name="wrapperPhaseChoice"
                                checked={keepWrapperPhase}
                                onChange={() => setKeepWrapperPhase(true)}
                                className="mt-0.5"
                              />
                              It&apos;s a real Phase — keep it
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-3">
                        <button onClick={() => { setPreview(null); setKeepWrapperPhase(false); }} className="btn btn-secondary text-sm">Cancel</button>
                        <button onClick={() => void handleConfirm()} disabled={confirming} className="btn btn-primary text-sm disabled:opacity-50 inline-flex items-center gap-1.5">
                          {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {confirming ? 'Importing…' : 'Confirm Import'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-xl py-12 px-4 text-center cursor-pointer transition-all ${
                    dragOver ? 'border-[var(--ax-accent)] bg-[rgba(var(--ax-accent-rgb),0.06)] scale-[1.005]' : 'border-[rgba(255,255,255,0.1)] hover:border-[rgba(var(--ax-accent-rgb),0.4)] hover:bg-[rgba(255,255,255,0.015)]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml,.mpp"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2.5">
                      <Loader2 className="w-8 h-8 text-[var(--ax-accent)] animate-spin" />
                      <p className="text-sm font-medium text-[rgba(232,228,220,0.65)]">Parsing schedule…</p>
                      <p className="text-xs text-[rgba(232,228,220,0.35)]">Native .mpp files run through a native binary converter — usually a few seconds.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2.5">
                      <UploadCloud className={`w-8 h-8 transition-colors ${dragOver ? 'text-[var(--ax-accent)]' : 'text-[rgba(232,228,220,0.35)]'}`} />
                      <p className="text-sm font-medium text-[rgba(232,228,220,0.75)]">
                        Drop your schedule file here, or click to browse
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.1)] text-[var(--ax-accent)] border border-[rgba(var(--ax-accent-rgb),0.2)]">.mpp</span>
                        <span className="text-[rgba(232,228,220,0.25)] text-xs">or</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.1)] text-[var(--ax-accent)] border border-[rgba(var(--ax-accent-rgb),0.2)]">.xml</span>
                      </div>
                      <p className="text-xs text-[rgba(232,228,220,0.35)]">
                        Native Microsoft Project files and File → Save As → XML exports both work directly.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); setShowGuide((v) => !v); }}
                className="flex items-center gap-1.5 text-xs text-[var(--ax-accent)] hover:underline"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                How should my file be structured for correct extraction?
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
              </button>
              {showGuide && (
                <div className="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] p-4 space-y-4 text-xs text-[rgba(232,228,220,0.7)]">
                  <p>Axinfra reads your Microsoft Project outline directly — no reformatting needed. Here&apos;s what each row type becomes:</p>

                  {/* Glossary — matches the icons shown in the WBS Tree below */}
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="rounded-md p-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Folder className="w-3.5 h-3.5 text-[var(--ax-accent)]" />
                        <span className="text-[#e8e4dc] font-semibold">Phase / Subphase</span>
                      </div>
                      <p>Any task marked <strong className="text-[#e8e4dc]">&quot;Summary&quot;</strong> in MS Project — it groups other tasks under it. Indent tasks (Tab key) to nest a Subphase inside a Phase, to any depth.</p>
                    </div>
                    <div className="rounded-md p-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ListTodo className="w-3.5 h-3.5 text-[rgba(232,228,220,0.5)]" />
                        <span className="text-[#e8e4dc] font-semibold">Task</span>
                      </div>
                      <p>An ordinary task with real duration — filed under whichever Phase/Subphase it sits beneath in your outline.</p>
                    </div>
                    <div className="rounded-md p-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Diamond className="w-3 h-3 text-[var(--ax-accent)]" fill="currentColor" />
                        <span className="text-[#e8e4dc] font-semibold">Milestone</span>
                      </div>
                      <p>A task with <strong className="text-[#e8e4dc]">&quot;Mark task as milestone&quot;</strong> checked in MS Project — usually automatic for any 0-duration task. Shown with a diamond.</p>
                    </div>
                  </div>

                  {/* Two rows that get special handling, explained plainly */}
                  <div className="space-y-2">
                    <p className="text-[#e8e4dc] font-semibold">Two rows Axinfra treats specially</p>
                    <div className="rounded-md p-3" style={{ background: 'rgba(var(--ax-accent-rgb),0.08)', border: '1px solid rgba(var(--ax-accent-rgb),0.2)' }}>
                      <p className="text-[var(--ax-accent)] font-medium mb-1">1. Row 0, the Project Summary Task — always skipped</p>
                      <p>MS Project always generates a hidden first row for the whole project — it&apos;s not something you created, and it&apos;s not a phase. Axinfra leaves it out and shows the same summary (total dates, duration, task count) at the top of the WBS Tree instead, labeled &quot;Project Summary&quot;.</p>
                    </div>
                    <div className="rounded-md p-3" style={{ background: 'rgba(var(--ax-accent-rgb),0.08)', border: '1px solid rgba(var(--ax-accent-rgb),0.2)' }}>
                      <p className="text-[var(--ax-accent)] font-medium mb-1">2. A single wrapper phase, if your file has one — Axinfra asks</p>
                      <p>Some schedules nest everything under one extra top-level phase before the real phases start (e.g. one task named after the whole project, containing &quot;Pre-Construction&quot;, &quot;Construction&quot;, etc. inside it). When Axinfra detects that pattern — a lone top-level task spanning the entire schedule — it asks you whether it&apos;s really just your project&apos;s name (skipped, its children become the real top-level phases) or an actual Phase you want to keep. A file that already has several top-level phases side by side is unaffected either way.</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[#e8e4dc] font-semibold mb-1">Fields read automatically — no extra setup</p>
                    <p>Planned / Baseline / Actual dates, % Complete, Work &amp; Remaining Work, Resource assignments, and Predecessor links (Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish, with lag) all come straight from their normal MS Project fields.</p>
                  </div>

                  <a href={`/api/projects/${projectId}/schedule/template`} className="inline-flex items-center gap-1.5 text-[var(--ax-accent)] hover:underline pt-1">
                    <Download className="w-3.5 h-3.5" /> Download a reference workbook showing this structure
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {!hasSchedule ? (
          <div className="card">
            <div className="card-body py-16 text-center space-y-2">
              <FileText className="w-8 h-8 text-[rgba(232,228,220,0.3)] mx-auto" />
              <p className="text-base font-semibold text-[#e8e4dc]">No schedule imported yet</p>
              <p className="text-sm text-[rgba(232,228,220,0.45)]">
                {canUpload ? 'Upload a schedule file above to get started.' : 'Waiting for the PMC to upload a schedule.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              {schedule?.latestConfirmedImport && (
                <div className="flex items-center gap-2 text-xs text-[rgba(232,228,220,0.4)]">
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">Confirmed</Badge>
                  <span>
                    Extracted from <span className="text-[rgba(232,228,220,0.6)]">{schedule.latestConfirmedImport.fileName}</span> ({schedule.latestConfirmedImport.sourceFormat}) on {formatDateTime(schedule.latestConfirmedImport.confirmedAt)}
                  </span>
                  <span className="text-[rgba(232,228,220,0.3)]">·</span>
                  <span>{schedule.phases.length} phases/subphases · {schedule.milestones.length} tasks · {resourceSummary.length} resources</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[rgba(232,228,220,0.3)]">Click a milestone to edit it.</span>
              <Link href={`/execution-intelligence/${projectId}/gantt`} className="ml-auto text-xs text-[var(--ax-accent)] hover:underline inline-flex items-center gap-1 shrink-0">
                Full Gantt &amp; Critical Path view <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="card">
              <div className="card-body p-0">
                <div className="p-4">
                  <WbsTree
                    phases={wbsPhases}
                    unphasedMilestones={unphasedMilestones}
                    onEditMilestone={(id) => setEditingMilestoneId(id)}
                    onEditPhase={canEditMilestones ? (id) => setEditingPhaseId(id) : undefined}
                  />
                </div>
              </div>
            </div>

            {resourceSummary.length > 0 && (
              <div className="card">
                <div className="card-header"><h2 className="text-base font-semibold">Resources</h2></div>
                <div className="card-body">
                  <div className="flex flex-wrap gap-2">
                    {resourceSummary.map((r) => (
                      <span key={r.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] text-xs text-[rgba(232,228,220,0.75)]">
                        {r.name}
                        {r.type && <span className="text-[rgba(232,228,220,0.35)]">· {r.type}</span>}
                        <span className="text-[var(--ax-accent)]">{r.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {editingMilestone && (
        <ActivityEditModal
          projectId={projectId}
          milestone={editingMilestone}
          canEdit={canEditMilestones}
          onClose={() => setEditingMilestoneId(null)}
          onSaved={() => void refetchSchedule()}
        />
      )}
      {editingPhase && (
        <PhaseEditModal
          projectId={projectId}
          phase={editingPhase}
          onClose={() => setEditingPhaseId(null)}
          onSaved={() => void refetchSchedule()}
        />
      )}
    </Layout>
  );
}
