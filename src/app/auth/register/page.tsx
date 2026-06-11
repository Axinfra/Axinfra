'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowRight, Loader2, AlertCircle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

const ROLES = [
  { id: 'CLIENT',      label: 'Client',      icon: '🏢', desc: 'Project owner' },
  { id: 'PMC',         label: 'PMC',          icon: '📋', desc: 'Project manager' },
  { id: 'VENDOR',      label: 'Vendor',       icon: '🔧', desc: 'Contractor' },
  { id: 'CONSULTANT',  label: 'Consultant',   icon: '💡', desc: 'Specialist' },
] as const;

type RoleId = (typeof ROLES)[number]['id'];

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter',  test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number',            test: (p: string) => /[0-9]/.test(p) },
];

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedRole, setSelectedRole] = useState<RoleId | null>(null);
  const [name, setName]                   = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [inviteEmail, setInviteEmail]     = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('error') === 'no_account') {
      setError('No account found for that Google email. Please sign up below and select your role.');
    }

    const inviteToken = searchParams.get('invite');
    if (inviteToken) {
      fetch(`/api/invite/${inviteToken}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.data?.email) {
            setInviteEmail(data.data.email);
            setEmail(data.data.email);
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) { setError('Please select your role to continue.'); return; }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          preferredRole: selectedRole,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const inviteToken = searchParams.get('invite');
        if (inviteToken) {
          router.push(`/invite/${inviteToken}`);
        } else {
          router.push(selectedRole === 'VENDOR' ? '/vendor' : '/projects');
        }
      } else {
        setError(data.error || 'Registration failed. Please try again.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const passwordOk = PASSWORD_RULES.every(r => r.test(password));

  return (
    <div className="min-h-screen w-full flex bg-[#0a0c10]">

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#0d0f13] flex-col justify-between p-16 xl:p-24 relative overflow-hidden border-r border-[rgba(255,255,255,0.07)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#c4a35a 0%,#a8893e 100%)' }}>
            <span className="text-[#0a0c10] text-sm font-bold">A</span>
          </div>
          <span className="text-[#e8e4dc] font-semibold text-lg tracking-tight">Axinfra</span>
        </div>

        <div className="z-10">
          <h1 className="text-[#e8e4dc] text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] mb-8">
            Built for <br />builders.
          </h1>
          <p className="text-[rgba(232,228,220,0.55)] text-xl leading-relaxed max-w-md font-light">
            Join construction teams that use evidence-based payments and real-time project intelligence.
          </p>
        </div>

        <div className="text-[rgba(232,228,220,0.35)] text-sm">&copy; Axinfra Inc.</div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-8 bg-[#0a0c10] overflow-y-auto">
        <div className="w-full max-w-sm py-8 space-y-7">

          {/* Mobile logo */}
          <div className="flex justify-center lg:hidden">
            <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#c4a35a 0%,#a8893e 100%)' }}>
              <span className="text-[#0a0c10] text-lg font-bold">A</span>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-[#e8e4dc] tracking-tight">Create account</h2>
            <p className="text-[rgba(232,228,220,0.5)] text-sm mt-1">
              Join Axinfra and start managing your projects.
            </p>
          </div>

          {/* Role selector */}
          <div>
            <p className="text-xs font-medium text-[rgba(232,228,220,0.45)] uppercase tracking-wider mb-3">
              I am joining as
            </p>
            <div className="grid grid-cols-4 gap-2">
              {ROLES.map((role) => {
                const active = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRole(role.id)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border py-3 px-1 transition-all duration-150"
                    style={{
                      background:  active ? 'rgba(196,163,90,0.1)'  : 'rgba(255,255,255,0.02)',
                      borderColor: active ? 'rgba(196,163,90,0.55)' : 'rgba(255,255,255,0.07)',
                    }}
                  >
                    <span className="text-lg leading-none">{role.icon}</span>
                    <span className="text-[10px] font-semibold leading-none" style={{ color: active ? '#c4a35a' : 'rgba(232,228,220,0.45)' }}>
                      {role.label}
                    </span>
                    <span className="text-[9px] leading-none" style={{ color: active ? 'rgba(196,163,90,0.7)' : 'rgba(232,228,220,0.25)' }}>
                      {role.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={() => {
              if (!selectedRole) { setError('Please select your role first.'); return; }
              setError('');
              window.location.href = `/api/auth/google?role=${selectedRole}`;
            }}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.16)] transition-all h-11 text-sm font-medium text-[#e8e4dc] cursor-pointer"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
            <span className="text-xs text-[rgba(232,228,220,0.3)] font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.07)]" />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-[rgba(220,80,60,0.1)] border border-[rgba(224,96,80,0.3)] rounded-lg p-3 flex items-start gap-3 text-sm text-[#e06050]">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider block">
                Full name
              </label>
              <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name" required autoComplete="name" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider block">
                Work email
              </label>
              <Input id="email" type="email" value={email} onChange={e => !inviteEmail && setEmail(e.target.value)}
                placeholder="name@company.com" required autoComplete="email"
                readOnly={!!inviteEmail}
                className={inviteEmail ? 'opacity-70 cursor-not-allowed' : ''} />
              {inviteEmail && (
                <p className="text-[11px] text-[rgba(196,163,90,0.7)]">
                  You must register with this email to accept the invitation.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider block">
                Password
              </label>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters" required autoComplete="new-password"
                  className="pr-10" />
                <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,228,220,0.35)] hover:text-[rgba(232,228,220,0.7)] transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {password.length > 0 && (
                <div className="space-y-1 pt-1">
                  {PASSWORD_RULES.map(rule => {
                    const ok = rule.test(password);
                    return (
                      <div key={rule.label} className="flex items-center gap-2">
                        <CheckCircle2 className={`h-3 w-3 shrink-0 ${ok ? 'text-[#22c55e]' : 'text-[rgba(232,228,220,0.2)]'}`} />
                        <span className={`text-[11px] ${ok ? 'text-[rgba(232,228,220,0.6)]' : 'text-[rgba(232,228,220,0.3)]'}`}>
                          {rule.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Button type="submit" disabled={loading || !passwordOk || !selectedRole}
              className="w-full h-11 rounded-xl bg-[#c4a35a] hover:bg-[#b3943f] text-[#0a0c10] font-semibold shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Creating account...</>
              ) : (
                <>Create account<ArrowRight className="ml-2 h-3.5 w-3.5 opacity-50" /></>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-[rgba(232,228,220,0.4)]">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-[#c4a35a] font-medium hover:underline">
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterContent />
    </Suspense>
  );
}
