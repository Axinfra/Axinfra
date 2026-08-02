'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Mail, Building2, UserCheck, Briefcase, CalendarDays, FileSignature } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Project Owner',
  PMC: 'Project Management Consultant',
  VENDOR: 'Vendor',
  CONSULTANT: 'Consultant',
  VIEWER: 'Viewer',
  SITE_ENGINEER: 'Site Engineer',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  CLIENT: 'Full oversight of payments, Order approvals, and project financials.',
  PMC: 'Create Orders, govern milestones, verify work, and manage vendors.',
  VENDOR: 'Execute work on-site, submit milestones for verification and receive payments.',
  CONSULTANT: 'Upload documents, review submissions, and export audit logs.',
  VIEWER: 'Read-only access to project status, milestones, and reports.',
  SITE_ENGINEER: 'Read-only view of Orders, Schedule, Activities, and RA Bills — no edit access.',
};

const ROLE_ICONS: Record<string, string> = {
  CLIENT: '🏢', PMC: '📋', VENDOR: '🔧', CONSULTANT: '💡', VIEWER: '👁', SITE_ENGINEER: '👷',
};

interface PurchaseOrderBOQ {
  id: string;
  boqNumber: string | null;
  name: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  value: number;
}

interface PurchaseOrderSummary {
  id: string;
  name: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  estimatedCost: number | null;
  workOrder: { number: string; status: string } | null;
  boqs: PurchaseOrderBOQ[];
}

interface InviteData {
  id: string;
  email: string;
  role: string;
  fee: number | null;
  projectName: string;
  inviterName: string;
  currency: string;
  purchaseOrder: PurchaseOrderSummary | null;
}

const WORK_ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Being drafted', ISSUED: 'Issued', PENDING_VENDOR_ACCEPTANCE: 'Awaiting your acceptance', ACCEPTED: 'Accepted',
};

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function fmtMoney(n: number | null, currency: string): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

type PageState = 'loading' | 'ready' | 'accepting' | 'accepted' | 'error';

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [state, setState] = useState<PageState>('loading');
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [session, setSession] = useState<{ email: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [inviteRes, sessionRes] = await Promise.all([
          fetch(`/api/invite/${token}`),
          fetch('/api/auth/session'),
        ]);

        const inviteData = await inviteRes.json();
        const sessionData = await sessionRes.json();

        if (!inviteData.success) {
          setErrorMsg(inviteData.error || 'This invite is invalid or has expired.');
          setState('error');
          return;
        }

        setInvite(inviteData.data);
        if (sessionData.success) {
          setSession({ email: sessionData.data.user.email });
        }
        setState('ready');
      } catch {
        setErrorMsg('Failed to load invite. Please try again.');
        setState('error');
      }
    };
    load();
  }, [token]);

  const handleAccept = async () => {
    setState('accepting');
    try {
      const res = await fetch(`/api/invite/${token}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setState('accepted');
        // A Purchase-Order assignment means "add your details before you start work" —
        // otherwise straight to the project, same as any other invite.
        const destination = data.phaseId
          ? `/vendor/complete-profile?projectId=${data.projectId}`
          : `/projects/${data.projectId}`;
        setTimeout(() => router.push(destination), 2000);
      } else {
        setErrorMsg(data.error || 'Failed to accept invite.');
        setState('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setState('error');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0c10] p-6">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--ax-accent) 0%, var(--ax-accent-hover) 100%)' }}
            >
              <span className="text-[#0a0c10] text-sm font-bold">A</span>
            </div>
            <span className="text-[#e8e4dc] font-semibold text-lg tracking-tight">Axinfra</span>
          </div>
        </div>

        {/* Loading */}
        {state === 'loading' && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-[var(--ax-accent)] animate-spin" />
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.08)] rounded-2xl p-8 text-center">
            <XCircle className="w-12 h-12 text-[#e06050] mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#e8e4dc] mb-2">Invite unavailable</h1>
            <p className="text-[rgba(232,228,220,0.55)] text-sm mb-6">{errorMsg}</p>
            <Link
              href="/auth/login"
              className="inline-block px-6 py-2.5 rounded-xl bg-[rgba(var(--ax-accent-rgb),0.1)] border border-[rgba(var(--ax-accent-rgb),0.25)] text-[var(--ax-accent)] text-sm font-medium hover:bg-[rgba(var(--ax-accent-rgb),0.15)] transition-colors"
            >
              Go to Login
            </Link>
          </div>
        )}

        {/* Accepted */}
        {state === 'accepted' && (
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.08)] rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-[#5cba80] mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#e8e4dc] mb-2">Invite accepted!</h1>
            <p className="text-[rgba(232,228,220,0.55)] text-sm">
              Redirecting you to the project…
            </p>
          </div>
        )}

        {/* Ready */}
        {(state === 'ready' || state === 'accepting') && invite && (
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.08)] rounded-2xl overflow-hidden">

            {/* Header band */}
            <div className="px-6 py-5 border-b border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-[var(--ax-accent)]" />
                <span className="text-xs font-medium text-[rgba(232,228,220,0.4)] uppercase tracking-wider">
                  Project Invitation
                </span>
              </div>
              <h1 className="text-xl font-bold text-[#e8e4dc] mt-1">
                You&apos;ve been invited
              </h1>
              <p className="text-sm text-[rgba(232,228,220,0.5)] mt-1">
                <strong className="text-[#e8e4dc]">{invite.inviterName}</strong> has invited you to collaborate on a project.
              </p>
            </div>

            {/* Details */}
            <div className="px-6 py-5 space-y-4">
              {/* Project */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[rgba(var(--ax-accent-rgb),0.08)] flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-[var(--ax-accent)]" />
                </div>
                <div>
                  <p className="text-xs text-[rgba(232,228,220,0.35)] font-medium uppercase tracking-wider mb-0.5">Project</p>
                  <p className="text-sm font-semibold text-[#e8e4dc]">{invite.projectName}</p>
                </div>
              </div>

              {/* Role */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[rgba(var(--ax-accent-rgb),0.08)] flex items-center justify-center shrink-0 text-lg">
                  {ROLE_ICONS[invite.role] ?? '👤'}
                </div>
                <div>
                  <p className="text-xs text-[rgba(232,228,220,0.35)] font-medium uppercase tracking-wider mb-0.5">Your Role</p>
                  <p className="text-sm font-semibold text-[var(--ax-accent)]">{ROLE_LABELS[invite.role] ?? invite.role}</p>
                  <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5 leading-relaxed">
                    {ROLE_DESCRIPTIONS[invite.role] ?? ''}
                  </p>
                </div>
              </div>

              {/* Invited email */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[rgba(var(--ax-accent-rgb),0.08)] flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4 text-[var(--ax-accent)]" />
                </div>
                <div>
                  <p className="text-xs text-[rgba(232,228,220,0.35)] font-medium uppercase tracking-wider mb-0.5">Invited Email</p>
                  <p className="text-sm font-medium text-[#e8e4dc]">{invite.email}</p>
                </div>
              </div>

              {/* Consultant fee — only present for a CONSULTANT invite */}
              {invite.role === 'CONSULTANT' && invite.fee != null && (
                <div className="rounded-xl border border-[rgba(var(--ax-accent-rgb),0.2)] bg-[rgba(var(--ax-accent-rgb),0.04)] p-4">
                  <p className="text-xs text-[rgba(232,228,220,0.4)] mb-0.5">Consultancy Fee</p>
                  <p className="text-sm font-semibold text-[#e8e4dc]">{fmtMoney(invite.fee, invite.currency)}</p>
                </div>
              )}

              {/* Purchase Order assignment — only present for the "Assign to Purchase Order"
                  onboarding option, not a plain email invite */}
              {invite.purchaseOrder && (
                <div className="rounded-xl border border-[rgba(var(--ax-accent-rgb),0.2)] bg-[rgba(var(--ax-accent-rgb),0.04)] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-[var(--ax-accent)] shrink-0" />
                    <p className="text-sm font-semibold text-[#e8e4dc]">{invite.purchaseOrder.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[rgba(232,228,220,0.4)] mb-0.5">Dates</p>
                      <p className="text-[#e8e4dc] flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 shrink-0" />
                        {fmtDate(invite.purchaseOrder.plannedStart)} → {fmtDate(invite.purchaseOrder.plannedEnd)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[rgba(232,228,220,0.4)] mb-0.5">Estimated Value</p>
                      <p className="text-[#e8e4dc]">{fmtMoney(invite.purchaseOrder.estimatedCost, invite.currency)}</p>
                    </div>
                    {invite.purchaseOrder.workOrder && (
                      <div className="col-span-2">
                        <p className="text-[rgba(232,228,220,0.4)] mb-0.5">Work Order</p>
                        <p className="text-[#e8e4dc] flex items-center gap-1">
                          <FileSignature className="w-3 h-3 shrink-0" />
                          {invite.purchaseOrder.workOrder.number} — {WORK_ORDER_STATUS_LABEL[invite.purchaseOrder.workOrder.status] ?? invite.purchaseOrder.workOrder.status}
                        </p>
                      </div>
                    )}
                  </div>
                  {invite.purchaseOrder.boqs.length > 0 && (
                    <div className="pt-2 border-t border-[rgba(255,255,255,0.06)] space-y-1.5">
                      <p className="text-[10px] text-[rgba(232,228,220,0.35)] font-medium uppercase tracking-wider">Orders</p>
                      {invite.purchaseOrder.boqs.map((b) => (
                        <div key={b.id} className="flex items-center justify-between text-xs">
                          <span className="text-[rgba(232,228,220,0.65)] truncate">
                            {b.boqNumber ?? '—'}{b.name ? ` · ${b.name}` : ''}
                          </span>
                          <span className="text-[#e8e4dc] shrink-0 ml-2">{fmtMoney(b.value, invite.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action */}
            <div className="px-6 pb-6 space-y-3">
              {session ? (
                session.email.toLowerCase() === invite.email.toLowerCase() ? (
                  <button
                    onClick={handleAccept}
                    disabled={state === 'accepting'}
                    className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                    style={{ background: 'var(--ax-accent)', color: '#0a0c10' }}
                  >
                    {state === 'accepting' ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Accepting…</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> Accept Invitation</>
                    )}
                  </button>
                ) : (
                  <div className="rounded-xl border border-[rgba(224,96,80,0.3)] bg-[rgba(224,96,80,0.07)] p-3 text-sm text-[#e06050] text-center">
                    You&apos;re signed in as <strong>{session.email}</strong>. Please sign in as <strong>{invite.email}</strong> to accept this invite.
                  </div>
                )
              ) : (
                <>
                  <Link
                    href={`/auth/register?invite=${token}`}
                    className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                    style={{ background: 'var(--ax-accent)', color: '#0a0c10' }}
                  >
                    Create Account & Accept
                  </Link>
                  <Link
                    href={`/auth/login?redirect=/invite/${token}`}
                    className="w-full h-11 rounded-xl font-medium text-sm flex items-center justify-center gap-2 border border-[rgba(255,255,255,0.1)] text-[rgba(232,228,220,0.7)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                  >
                    Already have an account? Sign in
                  </Link>
                </>
              )}

              <p className="text-xs text-center text-[rgba(232,228,220,0.25)]">
                This invitation expires in 30 days. You must sign in with {invite.email}.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
