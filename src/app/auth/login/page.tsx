'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowRight, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import AxinfraLogo from '@/components/AxinfraLogo';

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_denied:     'Google sign-in was cancelled.',
  google_failed:     'Google sign-in failed. Please try again.',
  google_unverified: 'Your Google account email is not verified.',
  server_error:      'A server error occurred. Please try again.',
  no_role:           'Your account has no role assigned. Please sign up again and select your role.',
};

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

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const googleError = searchParams.get('error');
    if (googleError && GOOGLE_ERROR_MESSAGES[googleError]) {
      setError(GOOGLE_ERROR_MESSAGES[googleError]);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.data.isAdmin) { router.push('/admin/dashboard'); return; }

        const preferredRole: string = data.data.preferredRole || '';
        const projectRoles: { role: string }[] = data.data.projectRoles || [];
        const isVendorOnly =
          preferredRole === 'VENDOR' ||
          (projectRoles.length > 0 && projectRoles.every((r) => r.role === 'VENDOR'));
        router.push(isVendorOnly ? '/vendor' : '/projects');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role: 'admin' | 'client' | 'pmc' | 'vendor' | 'consultant') => {
    const emails: Record<string, string> = {
      admin:      'admin@axinfra.local',
      client:     'client@example.com',
      pmc:        'pmc@example.com',
      vendor:     'vendor@example.com',
      consultant: 'consultant@example.com',
    };
    const passwords: Record<string, string> = {
      admin: 'admin123', client: 'password123', pmc: 'password123',
      vendor: 'password123', consultant: 'password123',
    };
    setEmail(emails[role]);
    setPassword(passwords[role]);
  };

  return (
    <div className="min-h-screen w-full flex bg-[var(--ax-base)]">

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-[var(--ax-surface)] flex-col justify-between p-16 xl:p-24 relative overflow-hidden border-r border-[var(--ax-border)]">
        <AxinfraLogo size="lg" href="/" />

        <div className="z-10">
          <h1 className="text-[var(--ax-text)] text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] mb-8">
            Infrastructure <br />for execution.
          </h1>
          <p className="text-[rgba(var(--ax-text-rgb),0.55)] text-xl leading-relaxed max-w-md font-light">
            Financial visibility and evidence-based payments for enterprise construction projects.
          </p>
        </div>

        <div className="text-[rgba(var(--ax-text-rgb),0.35)] text-sm">&copy; Axinfra Inc.</div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-8 bg-[var(--ax-base)] overflow-y-auto">
        <div className="w-full max-w-sm py-8 space-y-7">

          {/* Mobile logo */}
          <div className="flex justify-center lg:hidden mb-2">
            <AxinfraLogo size="md" href="/" />
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-[var(--ax-text)] tracking-tight">Welcome back</h2>
            <p className="text-[rgba(var(--ax-text-rgb),0.5)] text-sm mt-1">Sign in to your Axinfra workspace.</p>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={() => { window.location.href = '/api/auth/google'; }}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--ax-border)] bg-[var(--ax-overlay)] hover:bg-[var(--ax-overlay-hover)] hover:border-[var(--ax-border)] transition-all h-11 text-sm font-medium text-[var(--ax-text)] cursor-pointer"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-[var(--ax-overlay-hover)]" />
            <span className="text-xs text-[rgba(var(--ax-text-rgb),0.3)] font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-[var(--ax-overlay-hover)]" />
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
              <label htmlFor="email" className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                Email
              </label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com" required autoComplete="email" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                  Password
                </label>
                <Link href="#" className="text-xs font-medium text-[var(--ax-accent)] hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  required autoComplete="current-password" className="pr-10" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(var(--ax-text-rgb),0.35)] hover:text-[rgba(var(--ax-text-rgb),0.7)] transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading}
              className="w-full h-11 rounded-xl bg-[var(--ax-accent)] hover:bg-[var(--ax-accent-hover)] text-[var(--ax-btn-text)] font-semibold shadow-none transition-all">
              {loading ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Signing in...</>
              ) : (
                <>Sign in<ArrowRight className="ml-2 h-3.5 w-3.5 opacity-50" /></>
              )}
            </Button>
          </form>

          {/* Sign up link */}
          <p className="text-center text-sm text-[rgba(var(--ax-text-rgb),0.4)]">
            Don&apos;t have an account?{' '}
            <Link href="/auth/register" className="text-[var(--ax-accent)] font-medium hover:underline">
              Create account
            </Link>
          </p>

          {/* Demo access */}
          <div className="pt-4 border-t border-[var(--ax-border)]">
            <p className="text-xs text-center text-[rgba(var(--ax-text-rgb),0.3)] mb-3 font-medium uppercase tracking-wider">
              Demo Access
            </p>
            <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-[rgba(var(--ax-text-rgb),0.5)]">
              {(['client', 'pmc', 'vendor', 'consultant'] as const).map((role, i, arr) => (
                <React.Fragment key={role}>
                  <button type="button" onClick={() => fillDemo(role)}
                    className="hover:text-[var(--ax-accent)] transition-colors">
                    {role === 'pmc' ? 'PMC' : role.charAt(0).toUpperCase() + role.slice(1)}
                  </button>
                  {i < arr.length - 1 && <span className="text-[rgba(var(--ax-text-rgb),0.1)]">·</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
