'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Building2 } from 'lucide-react';

/** Shown right after a vendor accepts a Purchase-Order-linked invite — one-time onboarding
 * step so they land on the project with their company/contact details already on file,
 * instead of the PMC having to chase them down for it afterward. `projectId` (from the
 * invite accept redirect) decides where "Continue" sends them; falls back to the vendor
 * portal if it's missing (e.g. someone navigates here directly). */
export default function VendorCompleteProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0c10]">
        <Loader2 className="w-8 h-8 text-[var(--ax-accent)] animate-spin" />
      </div>
    }>
      <VendorCompleteProfileForm />
    </Suspense>
  );
}

function VendorCompleteProfileForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/vendor/profile');
        const data = await res.json();
        if (data.success) {
          setCompanyName(data.data.companyName ?? '');
          setContactPerson(data.data.contactPerson ?? data.data.name ?? '');
          setMobile(data.data.mobile ?? '');
          setGstNumber(data.data.gstNumber ?? '');
          setAddress(data.data.address ?? '');
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !mobile.trim()) {
      setError('Company name and mobile number are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/vendor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          contactPerson: contactPerson.trim() || undefined,
          mobile: mobile.trim(),
          gstNumber: gstNumber.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(projectId ? `/projects/${projectId}` : '/vendor');
      } else {
        setError(data.error ?? 'Failed to save your details.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0c10] p-6">
      <div className="w-full max-w-md">
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

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-[var(--ax-accent)] animate-spin" />
          </div>
        ) : (
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.08)] rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-[var(--ax-accent)]" />
                <span className="text-xs font-medium text-[rgba(232,228,220,0.4)] uppercase tracking-wider">
                  One last step
                </span>
              </div>
              <h1 className="text-xl font-bold text-[#e8e4dc] mt-1">Complete your profile</h1>
              <p className="text-sm text-[rgba(232,228,220,0.5)] mt-1">
                Add your company and contact details so the project team knows who they&apos;re working with.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && <div className="alert alert-error text-sm">{error}</div>}

              <div>
                <label className="label">Company Name <span className="text-[#e06050]">*</span></label>
                <input
                  autoFocus
                  type="text"
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Vanbros Construction Pvt. Ltd."
                />
              </div>
              <div>
                <label className="label">Contact Person</label>
                <input
                  type="text"
                  className="input"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="Who should we reach out to?"
                />
              </div>
              <div>
                <label className="label">Mobile Number <span className="text-[#e06050]">*</span></label>
                <input
                  type="tel"
                  className="input"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
              <div>
                <label className="label">GST Number</label>
                <input
                  type="text"
                  className="input"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="label">Address</label>
                <textarea
                  rows={2}
                  className="input resize-none"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{ background: 'var(--ax-accent)', color: '#0a0c10' }}
              >
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Continue to Project'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
