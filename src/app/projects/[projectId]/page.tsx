'use client';

import { useState, useRef } from 'react';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useProject } from '@/lib/contexts/ProjectContext';
import PhaseList from '@/components/phases/PhaseList';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';
import {
  Plus, X, Send, Paperclip, FileText, Image as ImageIcon, AlertCircle,
  Clock, CheckCircle2, ChevronDown, ChevronRight, Loader2, Ban,
  Inbox, MessageSquare, ArrowUpRight, ArrowDownLeft,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectData {
  id: string;
  name: string;
  description?: string;
  isExampleProject?: boolean;
  myRole: string;
  myUserId: string;
  permissions: Record<string, boolean>;
  boqs: Array<{ id: string; status: string; items: Array<{ id: string; plannedValue: number }> }>;
  milestones: Array<{
    id: string; title: string; state: string; paymentModel: string;
    plannedEnd: string | null;
    paymentEligibility?: { state: string; eligibleAmount: number };
  }>;
}

interface VendorRequestFile {
  id: string; fileName: string; mimeType: string; fileSize: number; createdAt: string;
  uploadedById: string;
}

interface VendorRequest {
  id: string; title: string; description: string;
  category: string; type: string; priority: string; status: string;
  sendTo: string; senderRole: string;
  dueDate: string | null; createdAt: string; updatedAt: string;
  responseNote: string | null; respondedAt: string | null;
  submittedBy: { id: string; name: string; email: string };
  respondedBy: { id: string; name: string } | null;
  files: VendorRequestFile[];
  // submittedById is available via submittedBy.id (API returns the relation, not raw FK)
}


// ── Role-specific type options ────────────────────────────────────────────────

const REQUEST_TYPES: Record<string, { value: string; label: string }[]> = {
  VENDOR: [
    { value: 'RFI',               label: 'RFI — Request for Information' },
    { value: 'MATERIAL_APPROVAL', label: 'Material Approval' },
    { value: 'CLARIFICATION',     label: 'Clarification' },
    { value: 'VARIATION',         label: 'Variation / Extra Work' },
    { value: 'SITE_INSTRUCTION',  label: 'Site Instruction Query' },
    { value: 'WORK_DELAY',        label: 'Work Delay Notice' },
    { value: 'PAYMENT_QUERY',     label: 'Payment Query' },
    { value: 'QUALITY_CONCERN',   label: 'Quality Concern' },
  ],
  PMC: [
    { value: 'WORK_ORDER',         label: 'Work Order' },
    { value: 'SITE_INSTRUCTION',   label: 'Site Instruction' },
    { value: 'INSPECTION_NOTICE',  label: 'Inspection Notice' },
    { value: 'SNAG_LIST',          label: 'Snag List' },
    { value: 'CHANGE_ORDER',       label: 'Change Order' },
    { value: 'DRAWING_REQUEST',    label: 'Drawing Request' },
    { value: 'CLARIFICATION',      label: 'Clarification Request' },
    { value: 'DESIGN_QUERY',       label: 'Design Query' },
  ],
  CONSULTANT: [
    { value: 'DESIGN_CLARIFICATION', label: 'Design Clarification' },
    { value: 'DRAWING_REVISION',     label: 'Drawing Revision Notice' },
    { value: 'SITE_GUIDANCE',        label: 'Site Guidance' },
    { value: 'VARIATION_PROPOSAL',   label: 'Variation Proposal' },
    { value: 'TECHNICAL_QUERY',      label: 'Technical Query' },
    { value: 'CLARIFICATION',        label: 'Clarification' },
  ],
  OWNER: [
    { value: 'CHANGE_REQUEST',    label: 'Change Request' },
    { value: 'APPROVAL_REQUEST',  label: 'Approval Request' },
    { value: 'QUERY',             label: 'General Query' },
    { value: 'NOTICE',            label: 'Notice / Directive' },
  ],
};

const SUBMISSION_TYPES: Record<string, { value: string; label: string }[]> = {
  VENDOR: [
    { value: 'DRAWING_SUBMISSION', label: 'Drawing Submission' },
    { value: 'INVOICE',            label: 'Invoice' },
    { value: 'PROGRESS_REPORT',    label: 'Progress Report' },
    { value: 'MATERIAL_SAMPLE',    label: 'Material Sample / Datasheet' },
    { value: 'TEST_REPORT',        label: 'Test Report' },
    { value: 'COMPLETION_CERT',    label: 'Completion Certificate' },
    { value: 'METHOD_STATEMENT',   label: 'Method Statement' },
  ],
  PMC: [
    { value: 'APPROVAL_LETTER',    label: 'Approval Letter' },
    { value: 'PAYMENT_CERTIFICATE',label: 'Payment Certificate' },
    { value: 'SITE_REPORT',        label: 'Site Report' },
    { value: 'INSPECTION_REPORT',  label: 'Inspection Report' },
    { value: 'VARIATION_ORDER',    label: 'Variation Order' },
  ],
  CONSULTANT: [
    { value: 'DRAWING_ISSUE',      label: 'Drawing Issue' },
    { value: 'DESIGN_NOTE',        label: 'Design Note' },
    { value: 'SPECIFICATION',      label: 'Specification Document' },
    { value: 'DESIGN_REPORT',      label: 'Design Report' },
    { value: 'RFI_RESPONSE',       label: 'RFI Response' },
  ],
  OWNER: [
    { value: 'PAYMENT_INSTRUCTION',label: 'Payment Instruction' },
    { value: 'APPROVAL',           label: 'Approval Document' },
    { value: 'DIRECTIVE',          label: 'Directive / Notice' },
  ],
};

// SendTo options per sender role
const SEND_TO_OPTIONS: Record<string, { value: string; label: string }[]> = {
  VENDOR: [
    { value: 'PMC',        label: 'PMC' },
    { value: 'CONSULTANT', label: 'Consultant' },
    { value: 'OWNER',      label: 'Owner' },
    { value: 'BOTH',       label: 'PMC & Consultant' },
    { value: 'ALL',        label: 'All (PMC, Consultant & Owner)' },
  ],
  PMC: [
    { value: 'VENDOR',     label: 'Vendor' },
    { value: 'CONSULTANT', label: 'Consultant' },
    { value: 'OWNER',      label: 'Owner' },
    { value: 'ALL',        label: 'All Parties' },
  ],
  CONSULTANT: [
    { value: 'VENDOR',     label: 'Vendor' },
    { value: 'PMC',        label: 'PMC' },
    { value: 'OWNER',      label: 'Owner' },
    { value: 'ALL',        label: 'All Parties' },
  ],
  OWNER: [
    { value: 'VENDOR',     label: 'Vendor' },
    { value: 'PMC',        label: 'PMC' },
    { value: 'CONSULTANT', label: 'Consultant' },
    { value: 'BOTH',       label: 'PMC & Consultant' },
    { value: 'ALL',        label: 'All Parties' },
  ],
};

// All type labels for display in cards
const ALL_TYPE_LABELS: Record<string, string> = {
  RFI: 'RFI', MATERIAL_APPROVAL: 'Material Appr.', CLARIFICATION: 'Clarification',
  VARIATION: 'Variation', SITE_INSTRUCTION: 'Site Instr.', WORK_DELAY: 'Work Delay',
  PAYMENT_QUERY: 'Payment Query', QUALITY_CONCERN: 'Quality', WORK_ORDER: 'Work Order',
  INSPECTION_NOTICE: 'Inspection', SNAG_LIST: 'Snag List', CHANGE_ORDER: 'Change Order',
  DRAWING_REQUEST: 'Drawing Req.', DESIGN_QUERY: 'Design Query', DESIGN_CLARIFICATION: 'Design Clarif.',
  DRAWING_REVISION: 'Drawing Rev.', SITE_GUIDANCE: 'Site Guidance', VARIATION_PROPOSAL: 'Var. Proposal',
  TECHNICAL_QUERY: 'Tech. Query', CHANGE_REQUEST: 'Change Req.', APPROVAL_REQUEST: 'Approval Req.',
  QUERY: 'Query', NOTICE: 'Notice', DRAWING_SUBMISSION: 'Drawing', INVOICE: 'Invoice',
  PROGRESS_REPORT: 'Progress Rpt', MATERIAL_SAMPLE: 'Material', TEST_REPORT: 'Test Report',
  COMPLETION_CERT: 'Completion Cert', METHOD_STATEMENT: 'Method Stmt', APPROVAL_LETTER: 'Approval Ltr',
  PAYMENT_CERTIFICATE: 'Payment Cert', SITE_REPORT: 'Site Report', INSPECTION_REPORT: 'Inspection Rpt',
  VARIATION_ORDER: 'Variation Ord.', DRAWING_ISSUE: 'Drawing Issue', DESIGN_NOTE: 'Design Note',
  SPECIFICATION: 'Specification', DESIGN_REPORT: 'Design Report', RFI_RESPONSE: 'RFI Response',
  PAYMENT_INSTRUCTION: 'Payment Instr.', APPROVAL: 'Approval', DIRECTIVE: 'Directive',
  OTHER: 'Other',
};

const PRIORITY_CFG: Record<string, { label: string; color: string; dot: string }> = {
  LOW:    { label: 'Low',    color: 'text-[rgba(232,228,220,0.45)]', dot: 'bg-[rgba(255,255,255,0.2)]' },
  NORMAL: { label: 'Normal', color: 'text-[#38bdf8]',               dot: 'bg-[#38bdf8]' },
  HIGH:   { label: 'High',   color: 'text-[#fb923c]',               dot: 'bg-[#fb923c]' },
  URGENT: { label: 'Urgent', color: 'text-[#e06050]',               dot: 'bg-[#e06050] animate-pulse' },
};

const STATUS_CFG: Record<string, { label: string; pill: string }> = {
  PENDING:      { label: 'Pending',      pill: 'bg-[rgba(196,163,90,0.12)] text-[#c4a35a] border-[rgba(196,163,90,0.3)]' },
  ACKNOWLEDGED: { label: 'Acknowledged', pill: 'bg-[rgba(56,189,248,0.12)] text-[#38bdf8] border-[rgba(56,189,248,0.3)]' },
  IN_REVIEW:    { label: 'In Review',    pill: 'bg-[rgba(129,140,248,0.12)] text-[#818cf8] border-[rgba(129,140,248,0.3)]' },
  RESOLVED:     { label: 'Resolved',     pill: 'bg-[rgba(92,186,128,0.12)] text-[#5cba80] border-[rgba(92,186,128,0.3)]' },
  REJECTED:     { label: 'Rejected',     pill: 'bg-[rgba(224,96,80,0.12)] text-[#e06050] border-[rgba(224,96,80,0.3)]' },
  WITHDRAWN:    { label: 'Withdrawn',    pill: 'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.4)] border-[rgba(255,255,255,0.1)]' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSendToLabel(sendTo: string): string {
  const map: Record<string, string> = {
    PMC: 'PMC', CONSULTANT: 'Consultant', OWNER: 'Owner', VENDOR: 'Vendor',
    BOTH: 'PMC & Consultant', ALL: 'All Parties',
  };
  return map[sendTo] ?? sendTo;
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.PENDING;
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.pill}`}>{cfg.label}</span>;
}

function PriorityDot({ priority }: { priority: string }) {
  const cfg = PRIORITY_CFG[priority] ?? PRIORITY_CFG.NORMAL;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { project: ctxProject, isLoading: loading, error } = useProject();
  const project = ctxProject as unknown as ProjectData | null;

  const [activeTab, setActiveTab] = useState<'overview' | 'inbox' | 'sent'>('overview');

  if (loading) return <Layout><TablePageSkeleton title={false} /></Layout>;
  if (error || !project) return <Layout><div className="alert alert-error">{error?.message || 'Project not found'}</div></Layout>;

  const myRole = project.myRole;
  const myUserId = project.myUserId;
  const isViewer = myRole === 'VIEWER';

  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...(!isViewer ? [
      { key: 'inbox', label: myRole === 'OWNER' ? 'All Communications' : 'Inbox' },
      { key: 'sent',  label: 'Sent' },
    ] : []),
  ];

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={project.name} role={myRole} />

      {project.isExampleProject && (
        <div className="mb-6 p-4 rounded-lg border-l-4 border-purple-500" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
          <p className="text-sm text-purple-300">
            <span className="font-medium">Example Project:</span> This project was created as an example for demonstration.
          </p>
        </div>
      )}

      {tabs.length > 1 && (
        <div className="border-b border-[rgba(255,255,255,0.07)] mb-6">
          <div className="flex gap-1">
            {tabs.map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key as typeof activeTab)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === key
                    ? 'border-[#c4a35a] text-[#c4a35a] bg-[rgba(196,163,90,0.06)]'
                    : 'border-transparent text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'overview' && myRole === 'VENDOR' && <VendorOverviewTab project={project} projectId={projectId} />}
      {activeTab === 'overview' && myRole !== 'VENDOR' && <OverviewTab project={project} projectId={projectId} />}
      {activeTab === 'inbox'    && !isViewer && <CommunicationTab projectId={projectId} myRole={myRole} myUserId={myUserId} view="inbox" />}
      {activeTab === 'sent'     && !isViewer && <CommunicationTab projectId={projectId} myRole={myRole} myUserId={myUserId} view="sent" />}
    </Layout>
  );
}

// ── Vendor Overview Tab ───────────────────────────────────────────────────────

function VendorOverviewTab({ project, projectId }: { project: ProjectData; projectId: string }) {
  const milestones = project.milestones ?? [];
  const ms = {
    total: milestones.length,
    inProgress: milestones.filter((m) => m.state === 'IN_PROGRESS').length,
    submitted: milestones.filter((m) => m.state === 'SUBMITTED').length,
    verified: milestones.filter((m) => m.state === 'VERIFIED').length,
    closed: milestones.filter((m) => m.state === 'CLOSED').length,
  };

  const totalEligible = milestones.reduce((sum, m) => sum + (m.paymentEligibility?.eligibleAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(232,228,220,0.6)' }}>My Milestones</p>
          <p className="text-2xl font-bold" style={{ color: '#f5f1e8' }}>{ms.total}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(232,228,220,0.6)' }}>In Progress</p>
          <p className="text-2xl font-bold text-orange-400">{ms.inProgress}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(232,228,220,0.6)' }}>Submitted</p>
          <p className="text-2xl font-bold text-blue-400">{ms.submitted}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(232,228,220,0.6)' }}>Verified</p>
          <p className="text-2xl font-bold text-green-400">{ms.verified}</p>
        </div></div>
      </div>

      {totalEligible > 0 && (
        <div className="card border border-[rgba(196,163,90,0.2)]">
          <div className="card-body">
            <p className="text-sm font-medium" style={{ color: 'rgba(232,228,220,0.6)' }}>Total Eligible Amount</p>
            <p className="text-3xl font-bold" style={{ color: '#c4a35a' }}>{formatCurrency(totalEligible)}</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h2 className="text-lg font-semibold">Quick Actions</h2></div>
        <div className="card-body flex flex-wrap gap-3">
          <Link href={`/projects/${projectId}/milestones`} className="btn btn-secondary">My Milestones</Link>
          <Link href={`/projects/${projectId}/payments`} className="btn btn-secondary">My Invoices</Link>
          <Link href={`/projects/${projectId}/dashboard`} className="btn btn-primary">View Dashboard</Link>
        </div>
      </div>

      {milestones.length > 0 ? (
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h2 className="text-lg font-semibold">My Milestones</h2>
            <Link href={`/projects/${projectId}/milestones`} className="text-sm hover:underline" style={{ color: '#c4a35a' }}>View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Title</th><th>State</th><th>Due Date</th><th>Payment Status</th></tr></thead>
              <tbody>
                {milestones.slice(0, 5).map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/projects/${projectId}/milestones/${m.id}`} className="hover:underline" style={{ color: '#c4a35a' }}>{m.title}</Link>
                    </td>
                    <td><MilestoneStateBadge state={m.state as any} /></td>
                    <td style={{ color: 'rgba(232,228,220,0.7)' }}>{formatDate(m.plannedEnd)}</td>
                    <td>
                      {m.paymentEligibility
                        ? <div className="flex items-center space-x-2">
                            <PaymentStatusBadge state={m.paymentEligibility.state as any} />
                            <span className="text-sm" style={{ color: 'rgba(232,228,220,0.7)' }}>{formatCurrency(m.paymentEligibility.eligibleAmount)}</span>
                          </div>
                        : <span style={{ color: 'rgba(232,228,220,0.4)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-10 text-center">
          <p className="text-sm text-[rgba(232,228,220,0.4)]">No milestones assigned to you yet</p>
        </div>
      )}
    </div>
  );
}

// ── Overview Tab (PMC / Consultant / Owner / Viewer) ──────────────────────────

function OverviewTab({ project, projectId }: { project: ProjectData; projectId: string }) {
  const boqs = project.boqs ?? [];
  const milestones = project.milestones ?? [];
  const totalBOQValue = boqs.reduce((sum, boq) => sum + (boq.items ?? []).reduce((s, i) => s + i.plannedValue, 0), 0);
  const ms = {
    total: milestones.length,
    draft: milestones.filter((m) => m.state === 'DRAFT').length,
    inProgress: milestones.filter((m) => m.state === 'IN_PROGRESS').length,
    submitted: milestones.filter((m) => m.state === 'SUBMITTED').length,
    verified: milestones.filter((m) => m.state === 'VERIFIED').length,
    closed: milestones.filter((m) => m.state === 'CLOSED').length,
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(232,228,220,0.6)' }}>Total BOQ Value</p>
          <p className="text-2xl font-bold" style={{ color: '#f5f1e8' }}>{formatCurrency(totalBOQValue)}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(232,228,220,0.6)' }}>Total Milestones</p>
          <p className="text-2xl font-bold" style={{ color: '#f5f1e8' }}>{ms.total}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(232,228,220,0.6)' }}>Verified</p>
          <p className="text-2xl font-bold text-green-400">{ms.verified}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(232,228,220,0.6)' }}>In Progress</p>
          <p className="text-2xl font-bold text-orange-400">{ms.inProgress}</p>
        </div></div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="text-lg font-semibold">Quick Actions</h2></div>
        <div className="card-body flex flex-wrap gap-3">
          {project.permissions?.canEditBOQ && <Link href={`/projects/${projectId}/boq`} className="btn btn-secondary">Manage BOQ</Link>}
          {project.permissions?.canEditMilestones && <Link href={`/projects/${projectId}/milestones`} className="btn btn-secondary">Manage Milestones</Link>}
          {project.permissions?.canReviewEvidence && <Link href={`/projects/${projectId}/evidence-review`} className="btn btn-secondary">Review Evidence</Link>}
          <Link href={`/projects/${projectId}/dashboard`} className="btn btn-primary">View Dashboard</Link>
        </div>
      </div>

      <PhaseList projectId={projectId} userRole={project.myRole} />

      <div className="card">
        <div className="card-header flex justify-between items-center">
          <h2 className="text-lg font-semibold">Recent Milestones</h2>
          <Link href={`/projects/${projectId}/milestones`} className="text-sm hover:underline" style={{ color: '#c4a35a' }}>View all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Title</th><th>State</th><th>Payment Model</th><th>Due Date</th><th>Payment Status</th></tr></thead>
            <tbody>
              {milestones.slice(0, 5).map((m) => (
                <tr key={m.id}>
                  <td><Link href={`/projects/${projectId}/milestones/${m.id}`} className="hover:underline" style={{ color: '#c4a35a' }}>{m.title}</Link></td>
                  <td><MilestoneStateBadge state={m.state as any} /></td>
                  <td style={{ color: 'rgba(232,228,220,0.7)' }}>{m.paymentModel}</td>
                  <td style={{ color: 'rgba(232,228,220,0.7)' }}>{formatDate(m.plannedEnd)}</td>
                  <td>{m.paymentEligibility
                    ? <div className="flex items-center space-x-2"><PaymentStatusBadge state={m.paymentEligibility.state as any} /><span className="text-sm" style={{ color: 'rgba(232,228,220,0.7)' }}>{formatCurrency(m.paymentEligibility.eligibleAmount)}</span></div>
                    : <span style={{ color: 'rgba(232,228,220,0.4)' }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="text-lg font-semibold">Milestone Progress</h2></div>
        <div className="card-body">
          <div className="flex items-center space-x-4">
            <div className="flex-1 rounded-full h-4 overflow-hidden flex" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              {ms.total > 0 && <>
                <div className="bg-gray-400" style={{ width: `${(ms.draft / ms.total) * 100}%` }} />
                <div className="bg-blue-500" style={{ width: `${(ms.inProgress / ms.total) * 100}%` }} />
                <div className="bg-yellow-500" style={{ width: `${(ms.submitted / ms.total) * 100}%` }} />
                <div className="bg-green-500" style={{ width: `${(ms.verified / ms.total) * 100}%` }} />
                <div className="bg-purple-500" style={{ width: `${(ms.closed / ms.total) * 100}%` }} />
              </>}
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs" style={{ color: 'rgba(232,228,220,0.6)' }}>
            <span>Draft: {ms.draft}</span><span>In Progress: {ms.inProgress}</span>
            <span>Submitted: {ms.submitted}</span><span>Verified: {ms.verified}</span><span>Closed: {ms.closed}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared state context for MessageCard (must live outside CommunicationTab) ─

interface MsgCtx {
  projectId: string;
  myUserId: string;
  myRole: string;
  view: 'inbox' | 'sent';
  myRoleSendTos: string[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  respondingId: string | null;
  setRespondingId: (id: string | null) => void;
  replyNote: string;
  setReplyNote: (v: string) => void;
  replyStatus: 'ACKNOWLEDGED' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  setReplyStatus: React.Dispatch<React.SetStateAction<'ACKNOWLEDGED' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'>>;
  replyFiles: File[];
  setReplyFiles: React.Dispatch<React.SetStateAction<File[]>>;
  replySubmitting: boolean;
  replyError: string;
  setReplyError: (v: string) => void;
  replyFileInputRef: React.RefObject<HTMLInputElement>;
  sendReply: (id: string) => Promise<void>;
  withdrawRequest: (id: string) => Promise<void>;
}

function FileChip({ f, requestId, projectId }: { f: VendorRequestFile; requestId: string; projectId: string }) {
  const mime = f.mimeType ?? '';
  return (
    <a
      href={`/api/projects/${projectId}/vendor-requests/${requestId}/files/${f.id}`}
      target="_blank" rel="noreferrer"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.22)] transition-colors text-xs text-[rgba(232,228,220,0.65)]">
      {mime.startsWith('image/') ? <ImageIcon className="w-3 h-3 shrink-0" /> : <FileText className="w-3 h-3 shrink-0" />}
      <span className="truncate max-w-[140px]">{f.fileName}</span>
      <span className="text-[rgba(232,228,220,0.3)] shrink-0">{fileSizeLabel(f.fileSize)}</span>
    </a>
  );
}

function MessageCard({ r, ctx }: { r: VendorRequest; ctx: MsgCtx }) {
  const {
    projectId, myUserId, myRole, view, myRoleSendTos,
    expandedId, setExpandedId, respondingId, setRespondingId,
    replyNote, setReplyNote, replyStatus, setReplyStatus,
    replyFiles, setReplyFiles, replySubmitting, replyError, setReplyError, replyFileInputRef,
    sendReply, withdrawRequest,
  } = ctx;

  const isOpen = expandedId === r.id;
  const isReplying = respondingId === r.id;
  const isMine = r.submittedBy.id === myUserId;
  const isClosed = ['RESOLVED', 'REJECTED', 'WITHDRAWN'].includes(r.status);
  const pcfg = PRIORITY_CFG[r.priority] ?? PRIORITY_CFG.NORMAL;
  const canReply = view === 'inbox' && (myRole === 'OWNER' || myRoleSendTos.includes(r.sendTo)) && !isClosed;

  const senderFiles = r.files.filter((f) => f.uploadedById === r.submittedBy.id);
  const replyAttachments = r.files.filter((f) => f.uploadedById !== r.submittedBy.id);

  const roleColors: Record<string, string> = {
    VENDOR: 'text-[#5cba80]', PMC: 'text-[#c4a35a]',
    CONSULTANT: 'text-[#818cf8]', OWNER: 'text-[#38bdf8]',
  };
  const senderColor = roleColors[r.senderRole] ?? 'text-[rgba(232,228,220,0.5)]';

  return (
    <div className={`rounded-xl border transition-all overflow-hidden ${isOpen ? 'border-[rgba(196,163,90,0.25)]' : 'border-[rgba(255,255,255,0.08)]'}`}
      style={{ background: 'rgba(255,255,255,0.02)' }}>

      {/* Thread header */}
      <button onClick={() => { setExpandedId(isOpen ? null : r.id); if (!isOpen) setRespondingId(null); }}
        className="w-full px-5 py-4 flex items-start gap-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left">
        <span className={`mt-2 shrink-0 w-2 h-2 rounded-full ${pcfg.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.5)] uppercase tracking-wide">
              {r.category === 'SUBMISSION' ? '↑ ' : '← '}{ALL_TYPE_LABELS[r.type] ?? r.type}
            </span>
            <StatusPill status={r.status} />
            <PriorityDot priority={r.priority} />
            {r.files.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-[rgba(232,228,220,0.35)]">
                <Paperclip className="w-3 h-3" />{r.files.length}
              </span>
            )}
            {r.responseNote && <span className="flex items-center gap-1 text-[10px] text-[#5cba80]"><MessageSquare className="w-3 h-3" />Replied</span>}
          </div>
          <p className="text-sm font-medium text-[#e8e4dc] truncate">{r.title}</p>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-[rgba(232,228,220,0.35)] flex-wrap">
            <span>
              {isMine
                ? <><ArrowUpRight className="w-3 h-3 inline mr-0.5" />To: <span className="text-[rgba(232,228,220,0.55)]">{parseSendToLabel(r.sendTo)}</span></>
                : <><ArrowDownLeft className="w-3 h-3 inline mr-0.5" />From: <span className={senderColor}>{r.submittedBy.name}</span> <span className="text-[rgba(232,228,220,0.25)]">({r.senderRole})</span></>
              }
            </span>
            <span>{formatDate(r.createdAt)}</span>
            {r.dueDate && <span className="flex items-center gap-1 text-[#fb923c]"><Clock className="w-3 h-3" />Due {formatDate(r.dueDate)}</span>}
          </div>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 mt-1 shrink-0 text-[rgba(232,228,220,0.25)]" /> : <ChevronRight className="w-4 h-4 mt-1 shrink-0 text-[rgba(232,228,220,0.25)]" />}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 space-y-3">
          {/* Message bubble */}
          <div className={`rounded-lg p-3.5 border ${
            isMine
              ? 'bg-[rgba(196,163,90,0.06)] border-[rgba(196,163,90,0.12)]'
              : 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)]'
          }`}>
            <p className={`text-[11px] font-medium mb-2 flex items-center gap-1.5 ${isMine ? 'text-[#c4a35a]' : senderColor}`}>
              {isMine ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
              {isMine ? `You (${myRole})` : `${r.submittedBy.name} · ${r.senderRole}`}
              <span className="font-normal text-[rgba(232,228,220,0.35)]">· {formatDate(r.createdAt)}</span>
              {r.dueDate && <span className="ml-2 text-[rgba(232,228,220,0.35)]">· Due {formatDate(r.dueDate)}</span>}
            </p>
            <p className="text-sm text-[rgba(232,228,220,0.8)] whitespace-pre-wrap leading-relaxed">{r.description}</p>
            {senderFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)]">
                {senderFiles.map((f) => <FileChip key={f.id} f={f} requestId={r.id} projectId={projectId} />)}
              </div>
            )}
          </div>

          {/* Response bubble */}
          {(r.responseNote || replyAttachments.length > 0) ? (
            <div className="rounded-lg p-3.5 bg-[rgba(92,186,128,0.06)] border border-[rgba(92,186,128,0.15)]">
              <p className="text-[11px] text-[#5cba80] font-medium mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                {r.respondedBy?.name ?? 'Respondent'} · {formatDate(r.respondedAt)}
              </p>
              {r.responseNote && (
                <p className="text-sm text-[rgba(232,228,220,0.75)] whitespace-pre-wrap leading-relaxed">{r.responseNote}</p>
              )}
              {replyAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[rgba(92,186,128,0.1)]">
                  {replyAttachments.map((f) => <FileChip key={f.id} f={f} requestId={r.id} projectId={projectId} />)}
                </div>
              )}
            </div>
          ) : r.status === 'REJECTED' ? (
            <div className="rounded-lg p-3 bg-[rgba(224,96,80,0.06)] border border-[rgba(224,96,80,0.12)]">
              <p className="text-xs text-[#e06050] flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" />Rejected with no note.</p>
            </div>
          ) : r.status !== 'PENDING' && r.status !== 'WITHDRAWN' ? (
            <div className="rounded-lg p-3 bg-[rgba(56,189,248,0.05)] border border-[rgba(56,189,248,0.12)]">
              <p className="text-xs text-[#38bdf8] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />{STATUS_CFG[r.status]?.label ?? r.status} — awaiting further action
              </p>
            </div>
          ) : r.status === 'WITHDRAWN' ? null : (
            <div className="rounded-lg p-3 border border-dashed border-[rgba(255,255,255,0.06)]">
              <p className="text-xs text-[rgba(232,228,220,0.25)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />Awaiting response from {parseSendToLabel(r.sendTo)}
              </p>
            </div>
          )}

          {/* Reply form */}
          {canReply && (
            isReplying ? (
              <div className="rounded-lg p-3.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(196,163,90,0.2)] space-y-3">
                <p className="text-[11px] text-[#c4a35a] font-medium">Reply as {myRole}</p>

                <textarea
                  className="input resize-none text-sm w-full" rows={3}
                  placeholder="Type your response…"
                  value={replyNote}
                  onChange={(e) => setReplyNote(e.target.value)} />

                {replyFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {replyFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-xs text-[rgba(232,228,220,0.7)]">
                        {f.type.startsWith('image/') ? <ImageIcon className="w-3 h-3 shrink-0" /> : <FileText className="w-3 h-3 shrink-0" />}
                        <span className="truncate max-w-[130px]">{f.name}</span>
                        <span className="text-[rgba(232,228,220,0.3)]">{fileSizeLabel(f.size)}</span>
                        <button onClick={() => setReplyFiles((p) => p.filter((_, j) => j !== i))}
                          className="text-[rgba(232,228,220,0.35)] hover:text-[#e06050] ml-0.5">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <select className="input text-xs py-1.5" value={replyStatus}
                    onChange={(e) => setReplyStatus(e.target.value as typeof replyStatus)}>
                    <option value="ACKNOWLEDGED">Acknowledge</option>
                    <option value="IN_REVIEW">Mark In Review</option>
                    <option value="RESOLVED">Mark Resolved</option>
                    <option value="REJECTED">Reject</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => replyFileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-[rgba(255,255,255,0.15)] text-xs text-[rgba(232,228,220,0.45)] hover:border-[rgba(196,163,90,0.4)] hover:text-[#c4a35a] transition-colors">
                    <Paperclip className="w-3 h-3" />Attach
                  </button>
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.dwg,.dxf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      setReplyFiles((p) => [...p, ...files]);
                      if (replyFileInputRef.current) replyFileInputRef.current.value = '';
                    }} />

                  <button onClick={() => { setReplyError(''); sendReply(r.id); }} disabled={replySubmitting}
                    className="btn btn-primary text-xs py-1.5 flex items-center gap-1.5 disabled:opacity-50">
                    {replySubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {replySubmitting ? 'Sending…' : 'Send'}
                  </button>
                  <button onClick={() => { setRespondingId(null); setReplyNote(''); setReplyFiles([]); setReplyError(''); }}
                    className="text-xs text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] px-2">Cancel</button>
                  {replyError && (
                    <p className="text-xs text-[#e06050] flex items-center gap-1 ml-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />{replyError}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <button onClick={() => setRespondingId(r.id)}
                className="flex items-center gap-2 text-xs text-[rgba(232,228,220,0.4)] hover:text-[#c4a35a] transition-colors px-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {r.responseNote ? 'Update response' : 'Reply'}
              </button>
            )
          )}

          {/* Withdraw */}
          {view === 'sent' && isMine && r.status === 'PENDING' && (
            <button onClick={() => withdrawRequest(r.id)}
              className="flex items-center gap-2 text-xs text-[rgba(232,228,220,0.3)] hover:text-[#e06050] transition-colors px-1">
              <X className="w-3 h-3" />Withdraw
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Unified Communication Tab (Inbox + Sent for all roles) ────────────────────

function CommunicationTab({
  projectId, myRole, myUserId, view,
}: {
  projectId: string; myRole: string; myUserId: string; view: 'inbox' | 'sent';
}) {
  const { data: allResp, mutate: refetch, error: loadError } = useSWR<VendorRequest[]>(
    `/api/projects/${projectId}/vendor-requests`, jsonFetcher
  );
  const all: VendorRequest[] = allResp ?? [];

  // Split: inbox = addressed to my role; sent = submitted by me
  const myRoleSendTos: string[] =
    myRole === 'PMC'        ? ['PMC', 'BOTH', 'ALL'] :
    myRole === 'CONSULTANT' ? ['CONSULTANT', 'BOTH', 'ALL'] :
    myRole === 'VENDOR'     ? ['VENDOR', 'BOTH', 'ALL'] :
    myRole === 'OWNER'      ? ['OWNER', 'ALL'] :
    [];

  const inbox = all.filter((r) => myRoleSendTos.includes(r.sendTo) && r.submittedBy.id !== myUserId);
  const sent  = all.filter((r) => r.submittedBy.id === myUserId);

  // For OWNER inbox: show everything not sent by owner (all communications)
  const inboxItems = myRole === 'OWNER'
    ? all.filter((r) => r.submittedBy.id !== myUserId)
    : inbox;

  const items = view === 'inbox' ? inboxItems : sent;

  const pending  = items.filter((r) => r.status === 'PENDING');
  const active   = items.filter((r) => ['ACKNOWLEDGED', 'IN_REVIEW'].includes(r.status));
  const resolved = items.filter((r) => ['RESOLVED', 'REJECTED', 'WITHDRAWN'].includes(r.status));

  // Compose form state
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [replyNote, setReplyNote] = useState('');
  const [replyStatus, setReplyStatus] = useState<'ACKNOWLEDGED' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'>('ACKNOWLEDGED');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const defaultType = (REQUEST_TYPES[myRole] ?? REQUEST_TYPES.VENDOR)[0].value;
  const [form, setForm] = useState({
    title: '', description: '', category: 'REQUEST' as 'REQUEST' | 'SUBMISSION',
    type: defaultType, priority: 'NORMAL', dueDate: '', sendTo: '',
  });

  const currentTypeOptions = form.category === 'REQUEST'
    ? (REQUEST_TYPES[myRole] ?? REQUEST_TYPES.VENDOR)
    : (SUBMISSION_TYPES[myRole] ?? SUBMISSION_TYPES.VENDOR);

  const sendToOptions = SEND_TO_OPTIONS[myRole] ?? SEND_TO_OPTIONS.VENDOR;

  const resetForm = () => {
    setForm({ title: '', description: '', category: 'REQUEST', type: defaultType, priority: 'NORMAL', dueDate: '', sendTo: '' });
    setPendingFiles([]);
    setFormError('');
    setShowForm(false);
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) { setFormError('Title and description are required'); return; }
    if (!form.sendTo) { setFormError('Please select a recipient'); return; }
    setSubmitting(true); setFormError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/vendor-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: form.category,
          title: form.title,
          description: form.description,
          type: form.type,
          priority: form.priority,
          dueDate: form.dueDate || undefined,
          sendTo: form.sendTo,
        }),
      });
      const data = await res.json();
      if (!data.success) { setFormError(data.error); return; }

      const failedUploads: string[] = [];
      for (const file of pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        const upRes = await fetch(`/api/projects/${projectId}/vendor-requests/${data.data.id}/files`, { method: 'POST', body: fd });
        if (!upRes.ok) {
          const upData = await upRes.json().catch(() => ({}));
          failedUploads.push(upData.error ? `${file.name}: ${upData.error}` : file.name);
        }
      }

      await refetch();
      if (failedUploads.length > 0) {
        setFormError(`Request sent, but ${failedUploads.length} file(s) failed to upload: ${failedUploads.join(', ')}`);
      } else {
        resetForm();
      }
    } catch { setFormError('Failed to submit'); }
    finally { setSubmitting(false); }
  };

  const sendReply = async (requestId: string) => {
    setReplySubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/vendor-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: replyStatus, responseNote: replyNote || undefined }),
      });
      const data = await res.json();
      if (!data.success) return;

      // Upload reply attachments
      const failedUploads: string[] = [];
      for (const file of replyFiles) {
        const fd = new FormData();
        fd.append('file', file);
        const upRes = await fetch(`/api/projects/${projectId}/vendor-requests/${requestId}/files`, { method: 'POST', body: fd });
        if (!upRes.ok) {
          const upData = await upRes.json().catch(() => ({}));
          failedUploads.push(upData.error ? `${file.name}: ${upData.error}` : file.name);
        }
      }

      setRespondingId(null);
      setReplyNote('');
      setReplyStatus('ACKNOWLEDGED');
      setReplyFiles([]);
      await refetch();
      if (failedUploads.length > 0) {
        setReplyError(`Reply sent, but ${failedUploads.length} file(s) failed: ${failedUploads.join(', ')}`);
      }
    } finally { setReplySubmitting(false); }
  };

  // Withdraw own sent request
  const withdrawRequest = async (requestId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/vendor-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'WITHDRAWN' }),
      });
      const data = await res.json();
      if (data.success) await refetch();
    } catch { /* silent */ }
  };

  const ctx: MsgCtx = {
    projectId, myUserId, myRole, view, myRoleSendTos,
    expandedId, setExpandedId, respondingId, setRespondingId,
    replyNote, setReplyNote, replyStatus, setReplyStatus,
    replyFiles, setReplyFiles, replySubmitting, replyError, setReplyError, replyFileInputRef,
    sendReply, withdrawRequest,
  };

  const isOwnerAllView = myRole === 'OWNER' && view === 'inbox';
  const inboxLabel = isOwnerAllView
    ? 'All Project Communications'
    : `Inbox — Received by ${myRole}`;
  const sentLabel = 'Sent';
  const pageLabel = view === 'inbox' ? inboxLabel : sentLabel;

  const pageDesc = view === 'inbox'
    ? (isOwnerAllView
        ? 'All requests and submissions across the project'
        : `Requests and submissions addressed to you as ${myRole}`)
    : 'Requests and submissions you sent to other parties';

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#e8e4dc] flex items-center gap-2">
            {view === 'inbox' ? <Inbox className="w-5 h-5 text-[#c4a35a]" /> : <Send className="w-5 h-5 text-[#c4a35a]" />}
            {pageLabel}
          </h2>
          <p className="text-sm text-[rgba(232,228,220,0.4)] mt-0.5">{pageDesc}</p>
        </div>
        {view === 'sent' && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />New
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Pending',     count: pending.length,  color: 'text-[#c4a35a]' },
          { label: 'In Progress', count: active.length,   color: 'text-[#818cf8]' },
          { label: 'Closed',      count: resolved.length, color: 'text-[rgba(232,228,220,0.4)]' },
        ].map((c) => (
          <div key={c.label} className="px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
            <span className="text-xs text-[rgba(232,228,220,0.45)]">{c.label} </span>
            <span className={`text-sm font-bold ${c.color}`}>{c.count}</span>
          </div>
        ))}
      </div>

      {/* Compose form (Sent tab only) */}
      {view === 'sent' && showForm && (
        <div className="card border border-[rgba(196,163,90,0.2)]">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-[#e8e4dc]">New Message</h3>
            <button onClick={resetForm} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc]"><X className="w-4 h-4" /></button>
          </div>
          <div className="card-body space-y-4">
            {formError && <div className="alert alert-error text-sm">{formError}</div>}

            {/* Category + SendTo row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label text-xs">Category <span className="text-[#e06050]">*</span></label>
                <select className="input text-sm" value={form.category}
                  onChange={(e) => {
                    const cat = e.target.value as 'REQUEST' | 'SUBMISSION';
                    const firstType = cat === 'REQUEST'
                      ? (REQUEST_TYPES[myRole] ?? REQUEST_TYPES.VENDOR)[0].value
                      : (SUBMISSION_TYPES[myRole] ?? SUBMISSION_TYPES.VENDOR)[0].value;
                    setForm((p) => ({ ...p, category: cat, type: firstType }));
                  }}>
                  <option value="REQUEST">Request</option>
                  <option value="SUBMISSION">Submission</option>
                </select>
              </div>
              <div>
                <label className="label text-xs">Send To <span className="text-[#e06050]">*</span></label>
                <select className="input text-sm" value={form.sendTo}
                  onChange={(e) => setForm((p) => ({ ...p, sendTo: e.target.value }))}>
                  <option value="" disabled>Select recipient…</option>
                  {sendToOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Type + Priority row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label text-xs">Type <span className="text-[#e06050]">*</span></label>
                <select className="input text-sm" value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                  {currentTypeOptions.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">Priority</label>
                <select className="input text-sm" value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="label text-xs">Subject / Title <span className="text-[#e06050]">*</span></label>
              <input className="input text-sm"
                placeholder={form.category === 'SUBMISSION' ? 'e.g. Structural Drawing Rev-B…' : 'Brief subject of your message…'}
                value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>

            {/* Description */}
            <div>
              <label className="label text-xs">Description <span className="text-[#e06050]">*</span></label>
              <textarea className="input resize-none text-sm" rows={4}
                placeholder={form.category === 'SUBMISSION'
                  ? 'Describe what you are submitting, revision notes, or any context for the reviewer…'
                  : 'Describe your request clearly. Include drawing references, specifications, or relevant context…'}
                value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>

            {/* Due date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label text-xs">Response Needed By</label>
                <input type="date" className="input text-sm" value={form.dueDate}
                  onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>

            {/* File attachments */}
            <div>
              <label className="label text-xs">Attachments <span className="text-[rgba(232,228,220,0.35)]">(PDF, images, Word, Excel, DWG/DXF — max 20 MB each)</span></label>
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-xs text-[rgba(232,228,220,0.7)]">
                    {f.type.startsWith('image/') ? <ImageIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    <span className="truncate max-w-[140px]">{f.name}</span>
                    <span className="text-[rgba(232,228,220,0.35)]">{fileSizeLabel(f.size)}</span>
                    <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))} className="text-[rgba(232,228,220,0.4)] hover:text-[#e06050]">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[rgba(255,255,255,0.15)] text-xs text-[rgba(232,228,220,0.5)] hover:border-[rgba(196,163,90,0.4)] hover:text-[#c4a35a] transition-colors">
                <Paperclip className="w-3.5 h-3.5" />Attach file
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.dwg,.dxf" multiple className="hidden" onChange={handleFileAdd} />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={resetForm} className="btn btn-secondary">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="card p-6 text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-[#e06050] mx-auto" />
          <p className="text-sm text-[#e06050]">Could not load messages</p>
        </div>
      )}

      {/* Empty state */}
      {!loadError && items.length === 0 && (
        <div className="card p-12 text-center">
          {view === 'inbox' ? <Inbox className="w-8 h-8 text-[rgba(232,228,220,0.1)] mx-auto mb-3" /> : <Send className="w-8 h-8 text-[rgba(232,228,220,0.1)] mx-auto mb-3" />}
          <p className="text-sm font-medium text-[rgba(232,228,220,0.45)]">
            {view === 'inbox' ? 'No messages received yet' : 'Nothing sent yet'}
          </p>
          <p className="text-xs text-[rgba(232,228,220,0.25)] mt-1">
            {view === 'inbox'
              ? 'Requests and submissions addressed to you will appear here'
              : 'Click "New" to compose a request or submission'}
          </p>
        </div>
      )}

      {/* Message sections */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-widest px-1">
            {view === 'inbox' ? 'Needs Response' : 'Pending'}
          </h3>
          {pending.map((r) => <MessageCard key={r.id} r={r} ctx={ctx} />)}
        </section>
      )}
      {active.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-widest px-1">In Progress</h3>
          {active.map((r) => <MessageCard key={r.id} r={r} ctx={ctx} />)}
        </section>
      )}
      {resolved.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-widest px-1">Closed</h3>
          {resolved.map((r) => <MessageCard key={r.id} r={r} ctx={ctx} />)}
        </section>
      )}
    </div>
  );
}
