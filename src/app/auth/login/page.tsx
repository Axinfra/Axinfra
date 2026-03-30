
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        // Check if user is vendor-only to redirect appropriately
        const sessionRes = await fetch('/api/auth/session');
        const sessionData = await sessionRes.json();
        if (sessionData.success) {
          const roles = sessionData.data.projectRoles || [];
          const vendorRoles = ['VENDOR'];
          const isVendorOnly = roles.length > 0 && roles.every((r: { role: string }) => vendorRoles.includes(r.role));
          router.push(isVendorOnly ? '/vendor' : '/projects');
        } else {
          router.push('/projects');
        }
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
    <div className="min-h-screen w-full flex bg-white">
      {/* Left Panel - Solid Navy, Minimal */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#0A2540] flex-col justify-between p-16 xl:p-24 relative overflow-hidden">
        {/* Logo area */}
        <div className="text-white font-bold text-xl tracking-tight">
          Axinfra
        </div>

        {/* Main Headings - Serious & Heavy */}
        <div className="z-10">
          <h1 className="text-white text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] mb-8">
            Infrastructure <br />
            for execution.
          </h1>
          <p className="text-[#879BB3] text-xl leading-relaxed max-w-md font-normal">
            Financial visibility and evidence-based payments for enterprise construction projects.
          </p>
        </div>

        {/* Copyright */}
        <div className="text-[#879BB3] text-sm">
          &copy; Axinfra Inc.
        </div>
      </div>

      {/* Right Panel - Clean, Sharp, Boring */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm space-y-10">

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">Log in</h2>
            <p className="text-gray-500 text-sm">Access your workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-sm p-3 flex items-start gap-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-gray-700 block">Email</label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                  className="h-10 rounded-md border-gray-300 focus:border-gray-500 focus:ring-gray-500/20"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-gray-700 block">Password</label>
                  <Link href="#" className="text-xs font-medium text-[#0A2540] hover:underline">Forgot password?</Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="h-10 rounded-md border-gray-300 focus:border-gray-500 focus:ring-gray-500/20"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 rounded-md bg-[#0A2540] hover:bg-[#0A2540]/90 text-white font-medium shadow-none transition-all"
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

          <div className="pt-6 border-t border-gray-100">
            <p className="text-xs text-center text-gray-400 mb-3 font-medium">Demo Access</p>
            <div className="flex items-center justify-center gap-4 text-xs font-medium text-gray-500">
              <button type="button" onClick={() => fillDemo('admin')} className="hover:text-[#0A2540] transition-colors">Admin</button>
              <span className="text-gray-300">·</span>
              <button type="button" onClick={() => fillDemo('owner')} className="hover:text-[#0A2540] transition-colors">Owner</button>
              <span className="text-gray-300">·</span>
              <button type="button" onClick={() => fillDemo('pmc')} className="hover:text-[#0A2540] transition-colors">PMC</button>
              <span className="text-gray-300">·</span>
              <button type="button" onClick={() => fillDemo('vendor')} className="hover:text-[#0A2540] transition-colors">Vendor</button>
              <span className="text-gray-300">·</span>
              <button type="button" onClick={() => fillDemo('viewer')} className="hover:text-[#0A2540] transition-colors">Viewer</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
