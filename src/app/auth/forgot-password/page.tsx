'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowRight, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import AxinfraLogo from '@/components/AxinfraLogo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } finally {
      // Always show the confirmation state, even on a network error — this page never reveals
      // whether an email matched an account, same reasoning as the API route's generic response.
      setLoading(false);
      setSubmitted(true);
    }
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
            Financial visibility and verification-based payments for enterprise construction projects.
          </p>
        </div>
        <div className="text-[rgba(var(--ax-text-rgb),0.35)] text-sm">&copy; Axinfra Inc.</div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-8 bg-[var(--ax-base)] overflow-y-auto">
        <div className="w-full max-w-sm py-8 space-y-7">
          <div className="flex justify-center lg:hidden mb-2">
            <AxinfraLogo size="md" href="/" />
          </div>

          {submitted ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-[rgba(92,186,128,0.12)] flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-[#5cba80]" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[var(--ax-text)] tracking-tight">Check your email</h2>
                <p className="text-[rgba(var(--ax-text-rgb),0.5)] text-sm mt-2">
                  If an account exists for <strong className="text-[var(--ax-text)]">{email}</strong>, we&apos;ve sent a new password to that address.
                </p>
              </div>
              <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ax-accent)] hover:underline">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-[var(--ax-text)] tracking-tight">Forgot your password?</h2>
                <p className="text-[rgba(var(--ax-text-rgb),0.5)] text-sm mt-1">
                  Enter your account email and we&apos;ll send you a new password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                    Email
                  </label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com" required autoComplete="email" />
                </div>

                <Button type="submit" disabled={loading}
                  className="w-full h-11 rounded-xl bg-[var(--ax-accent)] hover:bg-[var(--ax-accent-hover)] text-[var(--ax-btn-text)] font-semibold shadow-none transition-all">
                  {loading ? (
                    <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Sending...</>
                  ) : (
                    <>Send new password<ArrowRight className="ml-2 h-3.5 w-3.5 opacity-50" /></>
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-[rgba(var(--ax-text-rgb),0.4)]">
                <Link href="/auth/login" className="text-[var(--ax-accent)] font-medium hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
