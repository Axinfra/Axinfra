'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Building2, CheckCircle2, AlertTriangle, User as UserIcon, FolderKanban, KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react';
import Layout from '@/components/Layout';
import { jsonFetcher } from '@/lib/fetcher';

interface ProfileData {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  contactPerson: string | null;
  mobile: string | null;
  gstNumber: string | null;
  address: string | null;
  createdAt: string;
  isVendor: boolean;
  isProfileComplete: boolean;
  projects: Array<{ projectId: string; projectName: string; projectStatus: string; role: string }>;
}

const ROLE_LABEL: Record<string, string> = {
  CLIENT: 'Owner',
  PMC: 'PMC',
  VENDOR: 'Vendor',
  CONSULTANT: 'Consultant',
  VIEWER: 'Viewer',
  SITE_ENGINEER: 'Site Engineer',
};

export default function ProfilePage() {
  const { data: profile, isLoading, mutate } = useSWR<ProfileData>('/api/profile', jsonFetcher, {
    revalidateOnFocus: false,
  });

  const [form, setForm] = useState({
    name: '', companyName: '', contactPerson: '', mobile: '', gstNumber: '', address: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // A user can now hold more than one role on the same project (multi-role-per-project), so
  // /api/profile returns one array entry per (project, role) pair — grouping by projectId here
  // turns that back into one row per project with every role shown, instead of the same project
  // appearing twice (and colliding on the same React `key`) with only one role visible each time.
  const groupedProjects = useMemo(() => {
    if (!profile) return [];
    const byProject = new Map<string, { projectId: string; projectName: string; projectStatus: string; roles: string[] }>();
    for (const p of profile.projects) {
      const existing = byProject.get(p.projectId);
      if (existing) existing.roles.push(p.role);
      else byProject.set(p.projectId, { projectId: p.projectId, projectName: p.projectName, projectStatus: p.projectStatus, roles: [p.role] });
    }
    return Array.from(byProject.values());
  }, [profile]);

  // Change password
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwShow, setPwShow] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (pwForm.newPassword.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New password and confirmation do not match');
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPwSuccess('Password changed successfully.');
        setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPwError(data.error || 'Failed to change password');
      }
    } catch {
      setPwError('An error occurred while changing your password');
    } finally {
      setPwSaving(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name ?? '',
      companyName: profile.companyName ?? '',
      contactPerson: profile.contactPerson ?? '',
      mobile: profile.mobile ?? '',
      gstNumber: profile.gstNumber ?? '',
      address: profile.address ?? '',
    });
  }, [profile]);

  const updateForm = (updates: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        void mutate();
      } else {
        setError(data.error || 'Failed to save profile');
      }
    } catch {
      setError('An error occurred while saving your profile');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !profile) {
    return (
      <Layout>
        <div className="text-center py-12 text-[rgba(232,228,220,0.35)]">Loading…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--ax-accent-subtle)' }}>
            <span className="text-lg font-semibold" style={{ color: 'var(--ax-accent)' }}>
              {profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>My Profile</h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>{profile.email}</p>
          </div>
        </div>

        {/* Completeness banner — only vendors need a business/tax profile (GST is enforced
        before RA Bill submission / Work Order issuance, see api/profile/route.ts). Client/PMC/
        Consultant business fields are stored but never read anywhere else in the app. */}
        {profile.isVendor && (
          !profile.isProfileComplete ? (
            <div className="rounded-xl border p-4 flex items-start gap-3" style={{ borderColor: 'rgba(224,160,48,0.35)', background: 'rgba(224,160,48,0.07)' }}>
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#e0a030' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#e0a030' }}>Business profile incomplete</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(224,160,48,0.85)' }}>
                  Add your GST number below — RA Bills can’t be submitted and Work Orders can’t be issued for your account until this is filled in.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border p-4 flex items-center gap-3" style={{ borderColor: 'rgba(92,186,128,0.3)', background: 'rgba(92,186,128,0.07)' }}>
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#5cba80' }} />
              <p className="text-sm font-medium" style={{ color: '#5cba80' }}>Your business profile is complete.</p>
            </div>
          )
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {/* Personal Info */}
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <UserIcon className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
            <h2 className="font-semibold">Personal Info</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name *</label>
                <input
                  type="text" className="input"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input opacity-60 cursor-not-allowed" value={profile.email} disabled />
                <p className="text-xs mt-1" style={{ color: 'rgba(232,228,220,0.35)' }}>Your login email can&apos;t be changed here.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Business & Tax Details — vendor-only. These fields only ever appear on the
        Vendor party block of generated RA Bill / Work Order PDFs and are never read for
        Client/PMC/Consultant, so there's nothing for those roles to fill in here. */}
        {profile.isVendor && (
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <Building2 className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
              <h2 className="font-semibold">Business &amp; Tax Details</h2>
            </div>
            <div className="card-body space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Company / Firm Name</label>
                  <input
                    type="text" className="input" placeholder="e.g. Sharma Construction Co."
                    value={form.companyName}
                    onChange={(e) => updateForm({ companyName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Contact Person</label>
                  <input
                    type="text" className="input" placeholder="Who should be contacted for this account"
                    value={form.contactPerson}
                    onChange={(e) => updateForm({ contactPerson: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Mobile Number</label>
                  <input
                    type="tel" className="input" placeholder="+91 98765 43210"
                    value={form.mobile}
                    onChange={(e) => updateForm({ mobile: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    GST Number
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.12)] text-[var(--ax-accent)] font-semibold">Required</span>
                  </label>
                  <input
                    type="text" className="input" placeholder="22AAAAA0000A1Z5"
                    value={form.gstNumber}
                    onChange={(e) => updateForm({ gstNumber: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Business Address</label>
                <textarea
                  className="input" rows={2} placeholder="Registered business address"
                  value={form.address}
                  onChange={(e) => updateForm({ address: e.target.value })}
                />
              </div>
              <p className="text-xs" style={{ color: 'rgba(232,228,220,0.4)' }}>
                This information appears on generated RA Bills and Work Order documents.
              </p>
            </div>
          </div>
        )}

        {/* Save bar */}
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm" style={{ color: '#5cba80' }}>Saved</span>}
          <button onClick={handleSave} disabled={saving} className="btn btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Change Password */}
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <KeyRound className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
            <h2 className="font-semibold">Change Password</h2>
          </div>
          <div className="card-body space-y-4">
            {pwError && <div className="alert alert-error text-sm">{pwError}</div>}
            {pwSuccess && (
              <div className="rounded-lg border p-3 flex items-center gap-2 text-sm" style={{ borderColor: 'rgba(92,186,128,0.3)', background: 'rgba(92,186,128,0.07)', color: '#5cba80' }}>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {pwSuccess}
              </div>
            )}
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="label">Current Password</label>
                <div className="relative">
                  <input
                    type={pwShow ? 'text' : 'password'} className="input pr-10" autoComplete="current-password"
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">New Password</label>
                  <input
                    type={pwShow ? 'text' : 'password'} className="input" autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Confirm New Password</label>
                  <input
                    type={pwShow ? 'text' : 'password'} className="input" autoComplete="new-password"
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPwShow((v) => !v)}
                  className="text-xs font-medium flex items-center gap-1.5"
                  style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}
                >
                  {pwShow ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {pwShow ? 'Hide passwords' : 'Show passwords'}
                </button>
                <button
                  type="submit"
                  disabled={pwSaving || !pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword}
                  className="btn btn-primary disabled:opacity-50 flex items-center gap-1.5"
                >
                  {pwSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {pwSaving ? 'Changing…' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* My Projects — one row per project, all of that user's roles on it shown as pills
        (a user can hold more than one role on the same project since multi-role-per-project). */}
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <FolderKanban className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
            <h2 className="font-semibold">My Projects ({groupedProjects.length})</h2>
          </div>
          <div className="card-body p-0">
            {groupedProjects.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'rgba(232,228,220,0.45)' }}>You&apos;re not part of any project yet.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                {groupedProjects.map((p) => (
                  <Link
                    key={p.projectId}
                    href={`/projects/${p.projectId}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[rgba(var(--ax-accent-rgb),0.03)] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ax-text)' }}>{p.projectName}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.4)' }}>{p.projectStatus}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
                      {p.roles.map((role) => (
                        <span key={role} className="text-xs px-2 py-0.5 rounded-full font-medium bg-[rgba(255,255,255,0.06)]" style={{ color: 'rgba(232,228,220,0.6)' }}>
                          {ROLE_LABEL[role] ?? role}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
