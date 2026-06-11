'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Mail, Building2, UserCheck } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Project Owner',
  PMC: 'Project Management Consultant',
  VENDOR: 'Vendor',
  CONSULTANT: 'Consultant',
  VIEWER: 'Viewer',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  CLIENT: 'Full oversight of payments, BOQ approvals, and project financials.',
  PMC: 'Create BOQ, govern milestones, verify evidence, and manage vendors.',
  VENDOR: 'Execute work on-site, submit evidence for milestones and receive payments.',
  CONSULTANT: 'Upload documents, review evidence, and export audit logs.',
  VIEWER: 'Read-only access to project status, milestones, and reports.',
};

const ROLE_ICONS: Record<string, string> = {
  CLIENT: '🏢', PMC: '📋', VENDOR: '🔧', CONSULTANT: '💡', VIEWER: '👁',
};

interface InviteData {
  id: string;
  email: string;
  role: string;
  projectName: string;
  inviterName: string;
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
        setTimeout(() => router.push(`/projects/${data.projectId}`), 2000);
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
              style={{ background: 'linear-gradient(135deg, #c4a35a 0%, #a8893e 100%)' }}
            >
              <span className="text-[#0a0c10] text-sm font-bold">A</span>
            </div>
            <span className="text-[#e8e4dc] font-semibold text-lg tracking-tight">Axinfra</span>
          </div>
        </div>

        {/* Loading */}
        {state === 'loading' && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-[#c4a35a] animate-spin" />
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
              className="inline-block px-6 py-2.5 rounded-xl bg-[rgba(196,163,90,0.1)] border border-[rgba(196,163,90,0.25)] text-[#c4a35a] text-sm font-medium hover:bg-[rgba(196,163,90,0.15)] transition-colors"
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
                <Mail className="w-4 h-4 text-[#c4a35a]" />
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
                <div className="w-9 h-9 rounded-lg bg-[rgba(196,163,90,0.08)] flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-[#c4a35a]" />
                </div>
                <div>
                  <p className="text-xs text-[rgba(232,228,220,0.35)] font-medium uppercase tracking-wider mb-0.5">Project</p>
                  <p className="text-sm font-semibold text-[#e8e4dc]">{invite.projectName}</p>
                </div>
              </div>

              {/* Role */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[rgba(196,163,90,0.08)] flex items-center justify-center shrink-0 text-lg">
                  {ROLE_ICONS[invite.role] ?? '👤'}
                </div>
                <div>
                  <p className="text-xs text-[rgba(232,228,220,0.35)] font-medium uppercase tracking-wider mb-0.5">Your Role</p>
                  <p className="text-sm font-semibold text-[#c4a35a]">{ROLE_LABELS[invite.role] ?? invite.role}</p>
                  <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5 leading-relaxed">
                    {ROLE_DESCRIPTIONS[invite.role] ?? ''}
                  </p>
                </div>
              </div>

              {/* Invited email */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[rgba(196,163,90,0.08)] flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4 text-[#c4a35a]" />
                </div>
                <div>
                  <p className="text-xs text-[rgba(232,228,220,0.35)] font-medium uppercase tracking-wider mb-0.5">Invited Email</p>
                  <p className="text-sm font-medium text-[#e8e4dc]">{invite.email}</p>
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="px-6 pb-6 space-y-3">
              {session ? (
                session.email.toLowerCase() === invite.email.toLowerCase() ? (
                  <button
                    onClick={handleAccept}
                    disabled={state === 'accepting'}
                    className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                    style={{ background: '#c4a35a', color: '#0a0c10' }}
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
                    style={{ background: '#c4a35a', color: '#0a0c10' }}
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
