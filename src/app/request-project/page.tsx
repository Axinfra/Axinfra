'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import AxinfraLogo from '@/components/AxinfraLogo';

/**
 * Public "request a new project" form — replaces self-registering as a Client and freely
 * calling POST /api/projects, now that the platform charges per project. Submits to
 * POST /api/project-requests; an admin reviews it in /admin/project-requests and approves or
 * rejects it. On approval, a brand-new requester gets a welcome email with login credentials
 * (see POST /api/admin/project-requests/[id]/approve); an already-approved Client requesting
 * another project just gets notified their new project is ready.
 */
export default function RequestProjectPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDetails, setProjectDetails] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/project-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          companyName: companyName.trim() || undefined,
          phone: phone.trim() || undefined,
          projectName: projectName.trim(),
          projectDetails: projectDetails.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error || 'Could not submit your request. Please try again.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[var(--ax-base)]">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-[var(--ax-surface)] flex-col justify-between p-16 xl:p-24 relative overflow-hidden border-r border-[var(--ax-border)]">
        <AxinfraLogo size="lg" href="/" />
        <div className="z-10">
          <h1 className="text-[var(--ax-text)] text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] mb-8">
            Own the <br />build.
          </h1>
          <p className="text-[rgba(var(--ax-text-rgb),0.55)] text-xl leading-relaxed max-w-md font-light">
            Tell us about your project and we'll set up your Axinfra workspace — verification-based
            payments and real-time project intelligence, ready in one login.
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
            <div className="space-y-5 text-center">
              <div className="flex justify-center">
                <CheckCircle2 className="h-12 w-12 text-[#22c55e]" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-[var(--ax-text)] tracking-tight">Request received</h2>
                <p className="text-[rgba(var(--ax-text-rgb),0.5)] text-sm mt-2">
                  We've emailed you a confirmation. Our team will review "{projectName}" and send your
                  login details to <span className="text-[var(--ax-text)]">{email}</span> once it's approved.
                </p>
              </div>
              <Link href="/" className="inline-block text-sm text-[var(--ax-accent)] font-medium hover:underline">
                Back to home
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-[var(--ax-text)] tracking-tight">Request a project</h2>
                <p className="text-[rgba(var(--ax-text-rgb),0.5)] text-sm mt-1">
                  Every project on Axinfra is set up by our team — tell us about yours and we'll get you access.
                </p>
              </div>

              {error && (
                <div className="bg-[rgba(220,80,60,0.1)] border border-[rgba(224,96,80,0.3)] rounded-lg p-3 flex items-start gap-3 text-sm text-[#e06050]">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="name" className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                    Full name
                  </label>
                  <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Your name" required autoComplete="name" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                    Work email
                  </label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="name@company.com" required autoComplete="email" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="companyName" className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                    Company <span className="normal-case font-normal text-[rgba(var(--ax-text-rgb),0.3)]">(optional)</span>
                  </label>
                  <Input id="companyName" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder="Your company" autoComplete="organization" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="phone" className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                    Phone <span className="normal-case font-normal text-[rgba(var(--ax-text-rgb),0.3)]">(optional)</span>
                  </label>
                  <Input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98765 43210" autoComplete="tel" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="projectName" className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                    Project name
                  </label>
                  <Input id="projectName" type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                    placeholder="e.g. Riverside Towers, Phase 2" required />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="projectDetails" className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider block">
                    Project details <span className="normal-case font-normal text-[rgba(var(--ax-text-rgb),0.3)]">(optional)</span>
                  </label>
                  <textarea id="projectDetails" value={projectDetails} onChange={e => setProjectDetails(e.target.value)}
                    placeholder="Location, scale, anything that helps us set things up"
                    rows={3}
                    className="w-full rounded-xl border border-[var(--ax-border)] bg-[var(--ax-input)] px-3.5 py-2.5 text-sm text-[var(--ax-text)] placeholder:text-[rgba(var(--ax-text-rgb),0.3)] outline-none focus:border-[rgba(var(--ax-accent-rgb),0.5)] transition-colors resize-none" />
                </div>

                <Button type="submit" disabled={loading}
                  className="w-full h-11 rounded-xl bg-[var(--ax-accent)] hover:bg-[var(--ax-accent-hover)] text-[var(--ax-btn-text)] font-semibold shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? (
                    <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Submitting...</>
                  ) : (
                    <>Submit request<ArrowRight className="ml-2 h-3.5 w-3.5 opacity-50" /></>
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-[rgba(var(--ax-text-rgb),0.4)]">
                Joining an existing project instead?{' '}
                <Link href="/auth/register" className="text-[var(--ax-accent)] font-medium hover:underline">
                  Create an account
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
