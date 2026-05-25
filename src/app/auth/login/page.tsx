
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowRight, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
        const roles: { role: string }[] = data.data.projectRoles || [];
        const isVendorOnly = roles.length > 0 && roles.every((r) => r.role === 'VENDOR');
        router.push(isVendorOnly ? '/vendor' : '/projects');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role: 'admin' | 'owner' | 'pmc' | 'vendor' | 'viewer') => {
    const emails: Record<string, string> = {
      admin: 'admin@axinfra.local',
      owner: 'owner@example.com',
      pmc: 'pmc@example.com',
      vendor: 'vendor@example.com',
      viewer: 'viewer@example.com',
    };
    // Only auto-fill passwords in development mode
    if (process.env.NODE_ENV === 'development') {
      const passwords: Record<string, string> = {
        admin: 'admin123',
        owner: 'password123',
        pmc: 'password123',
        vendor: 'password123',
        viewer: 'password123',
      };
      setPassword(passwords[role]);
    }
    setEmail(emails[role]);
  };

  return (
    <div className="min-h-screen w-full flex bg-[#0a0c10]">
      {/* Left Panel - Dark with gold accents */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#0d0f13] flex-col justify-between p-16 xl:p-24 relative overflow-hidden border-r border-[rgba(255,255,255,0.07)]">
        {/* Logo area */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4a35a 0%, #a8893e 100%)' }}>
            <span className="text-[#0a0c10] text-sm font-bold font-display">A</span>
          </div>
          <span className="text-[#e8e4dc] font-semibold text-lg tracking-tight">Axinfra</span>
        </div>

        {/* Main Headings */}
        <div className="z-10">
          <h1 className="text-[#e8e4dc] text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] mb-8 font-display">
            Infrastructure <br />
            for execution.
          </h1>
          <p className="text-[rgba(232,228,220,0.55)] text-xl leading-relaxed max-w-md font-light">
            Financial visibility and evidence-based payments for enterprise construction projects.
          </p>
        </div>

        {/* Copyright */}
        <div className="text-[rgba(232,228,220,0.35)] text-sm">
          &copy; Axinfra Inc.
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-8 bg-[#0a0c10]">
        <div className="w-full max-w-sm space-y-10">

          {/* Gold logo mark at top */}
          <div className="flex justify-center lg:hidden mb-4">
            <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4a35a 0%, #a8893e 100%)' }}>
              <span className="text-[#0a0c10] text-lg font-bold font-display">A</span>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-[#e8e4dc] tracking-tight">Log in</h2>
            <p className="text-[rgba(232,228,220,0.55)] text-sm">Access your workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-[rgba(220,80,60,0.1)] border border-[rgba(224,96,80,0.3)] rounded-lg p-3 flex items-start gap-3 text-sm text-[#e06050]">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider block">Email</label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider block">Password</label>
                  <Link href="#" className="text-xs font-medium text-[#c4a35a] hover:underline">Forgot password?</Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,228,220,0.35)] hover:text-[rgba(232,228,220,0.7)] transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 rounded-lg bg-[#c4a35a] hover:bg-[#b3943f] text-[#0a0c10] font-semibold shadow-none transition-all"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="ml-2 h-3.5 w-3.5 opacity-50" />
                </>
              )}
            </Button>
          </form>

          <div className="pt-6 border-t border-[rgba(255,255,255,0.07)]">
            <p className="text-xs text-center text-[rgba(232,228,220,0.35)] mb-3 font-medium uppercase tracking-wider">Demo Access</p>
            <div className="flex items-center justify-center gap-4 text-xs font-medium text-[rgba(232,228,220,0.55)]">
              <button type="button" onClick={() => fillDemo('admin')} className="hover:text-[#c4a35a] transition-colors">Admin</button>
              <span className="text-[rgba(255,255,255,0.12)]">·</span>
              <button type="button" onClick={() => fillDemo('owner')} className="hover:text-[#c4a35a] transition-colors">Owner</button>
              <span className="text-[rgba(255,255,255,0.12)]">·</span>
              <button type="button" onClick={() => fillDemo('pmc')} className="hover:text-[#c4a35a] transition-colors">PMC</button>
              <span className="text-[rgba(255,255,255,0.12)]">·</span>
              <button type="button" onClick={() => fillDemo('vendor')} className="hover:text-[#c4a35a] transition-colors">Vendor</button>
              <span className="text-[rgba(255,255,255,0.12)]">·</span>
              <button type="button" onClick={() => fillDemo('viewer')} className="hover:text-[#c4a35a] transition-colors">Viewer</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
