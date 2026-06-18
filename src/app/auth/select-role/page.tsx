'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2 } from 'lucide-react';
import AxinfraLogo from '@/components/AxinfraLogo';

const ROLES = [
  {
    id: 'CLIENT',
    label: 'Project Owner',
    description: 'You commission and finance the project. Full oversight of payments and approvals.',
    icon: '🏢',
  },
  {
    id: 'PMC',
    label: 'PMC',
    description: 'Project Management Consultant. You oversee execution, verify milestones, and manage vendors.',
    icon: '📋',
  },
  {
    id: 'VENDOR',
    label: 'Vendor',
    description: 'You execute work on-site and submit milestones for verification and payment.',
    icon: '🔧',
  },
  {
    id: 'CONSULTANT',
    label: 'Consultant',
    description: 'You provide advisory or specialist input to the project team.',
    icon: '💡',
  },
  {
    id: 'VIEWER',
    label: 'Viewer',
    description: 'Read-only access. You observe project status without making changes.',
    icon: '👁',
  },
] as const;

type RoleId = (typeof ROLES)[number]['id'];

export default function SelectRolePage() {
  const router = useRouter();
  const [selected, setSelected] = useState<RoleId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/select-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selected }),
      });
      const data = await res.json();
      if (data.success) {
        router.push('/projects');
      } else {
        setError(data.error ?? 'Something went wrong');
      }
    } catch {
      setError('Network error, please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--ax-base)] p-6">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-10 text-center">
          <div className="flex justify-center mb-5">
            <AxinfraLogo size="lg" href="/" />
          </div>
          <h1 className="text-[var(--ax-text)] text-2xl font-bold tracking-tight mb-2">
            What best describes your role?
          </h1>
          <p className="text-[rgba(var(--ax-text-rgb),0.5)] text-sm leading-relaxed">
            This helps us tailor your Axinfra experience. You can update it later in your profile.
          </p>
        </div>

        {/* Role cards */}
        <div className="space-y-2.5 mb-8">
          {ROLES.map((role) => {
            const isActive = selected === role.id;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelected(role.id)}
                className="w-full text-left rounded-xl border transition-all duration-150 p-4 flex items-start gap-4 group"
                style={{
                  background: isActive
                    ? 'rgba(var(--ax-accent-rgb),0.08)'
                    : 'var(--ax-overlay)',
                  borderColor: isActive
                    ? 'rgba(var(--ax-accent-rgb),0.5)'
                    : 'var(--ax-border)',
                }}
              >
                {/* Icon */}
                <span
                  className="text-xl mt-0.5 w-9 h-9 flex items-center justify-center rounded-lg shrink-0"
                  style={{
                    background: isActive
                      ? 'rgba(var(--ax-accent-rgb),0.15)'
                      : 'var(--ax-overlay)',
                  }}
                >
                  {role.icon}
                </span>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold mb-0.5"
                    style={{ color: isActive ? 'var(--ax-accent)' : 'var(--ax-text)' }}
                  >
                    {role.label}
                  </p>
                  <p className="text-xs leading-relaxed text-[rgba(var(--ax-text-rgb),0.45)]">
                    {role.description}
                  </p>
                </div>

                {/* Check */}
                <div className="shrink-0 mt-0.5">
                  {isActive ? (
                    <CheckCircle2 className="h-5 w-5 text-[var(--ax-accent)]" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border border-[var(--ax-border)]" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <p className="text-[#e06050] text-sm text-center mb-4">{error}</p>
        )}

        {/* CTA */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selected || loading}
          className="w-full h-11 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
          style={{
            background:
              selected && !loading
                ? 'linear-gradient(135deg, var(--ax-accent) 0%, var(--ax-accent-hover) 100%)'
                : 'var(--ax-overlay-hover)',
            color: selected && !loading ? 'var(--ax-btn-text)' : 'rgba(var(--ax-text-rgb),0.3)',
            cursor: selected && !loading ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Continue to Axinfra'
          )}
        </button>

        <p className="text-center text-xs text-[rgba(var(--ax-text-rgb),0.25)] mt-5">
          Your role preference is visible only to project admins.
        </p>
      </div>
    </div>
  );
}
