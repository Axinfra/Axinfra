'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';
import { AlertCircle, AlertTriangle, Clock, Loader2, Mail, Plus, Users, Check } from 'lucide-react';

interface ProjectOption {
  projectId: string;
  projectName: string;
  role: string;
}

interface VendorRow {
  userId: string | null;
  inviteId: string | null;
  name: string;
  email: string;
  role: string;
  assignedAt: string;
  userCreatedAt: string | null;
  isPendingInvite: boolean;
}

interface Props {
  projects: ProjectOption[];
  initialProjectId: string;
  initialVendors: VendorRow[];
}

export default function VendorOnboardingClient({
  projects,
  initialProjectId,
  initialVendors,
}: Props) {
  const [selectedProject, setSelectedProject] = useState(initialProjectId);

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [conflictData, setConflictData] = useState<{ userPreferredRole: string; message: string } | null>(null);

  const ROLE_LABELS: Record<string, string> = {
    CLIENT: 'Project Owner', PMC: 'PMC', VENDOR: 'Vendor', CONSULTANT: 'Consultant', VIEWER: 'Viewer',
  };

  const { data, isValidating, mutate } = useSWR<VendorRow[]>(
    selectedProject ? `/api/admin/vendors?projectId=${selectedProject}` : null,
    jsonFetcher,
    {
      fallbackData: selectedProject === initialProjectId ? initialVendors : undefined,
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    },
  );
  const vendors: VendorRow[] = data ?? [];
  const vendorsLoading =
    isValidating && selectedProject !== initialProjectId && !data;

  const submitVendor = async (force: boolean) => {
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, projectId: selectedProject, force }),
      });
      const body = await res.json();
      if (body.success) {
        setConflictData(null);
        if (body.invited) {
          setFormSuccess(body.message ?? `Invitation sent to ${email}.`);
        } else {
          setFormSuccess(`Vendor "${body.data.name}" added to the project.`);
        }
        setEmail('');
        mutate();
      } else if (body.conflict) {
        setConflictData({ userPreferredRole: body.userPreferredRole, message: body.error });
      } else {
        setFormError(body.error || 'Failed to add vendor');
      }
    } catch {
      setFormError('An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setConflictData(null);
    void submitVendor(false);
  };

  const handleConfirmConflict = () => {
    void submitVendor(true);
  };

  const currentProjectName =
    projects.find((p) => p.projectId === selectedProject)?.projectName ?? '';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-[var(--ax-accent)]" />
          <h1 className="text-xl font-semibold text-[var(--ax-text)]">Vendor Onboarding</h1>
        </div>
        <p className="text-sm text-[rgba(var(--ax-text-rgb),0.55)]">
          Invite vendors by email. They'll receive an invitation link to join the project.
        </p>
      </div>

      {/* Project selector */}
      {projects.length > 1 && (
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-[var(--ax-text)] mb-1.5">Project</label>
          <select
            className="w-full h-10 rounded-[10px] border border-[var(--ax-border)] bg-[var(--ax-card)] px-3 text-sm
              focus:outline-none focus:ring-4 focus:ring-[rgba(var(--ax-accent-rgb),0.3)]/10 focus:border-[var(--ax-accent)]
              transition-all duration-200"
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              setFormError('');
              setFormSuccess('');
              setConflictData(null);
            }}
          >
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.projectName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Invite form */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Plus className="w-4 h-4 text-[var(--ax-accent)]" />
              <h2 className="text-sm font-semibold text-[var(--ax-text)]">Invite Vendor</h2>
            </div>

            {conflictData ? (
              /* Role conflict confirmation step */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(224,152,64,0.07)] border border-[rgba(224,152,64,0.22)]">
                  <AlertTriangle className="w-5 h-5 text-[#e09840] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[#e09840] mb-1">Role Mismatch</p>
                    <p className="text-xs text-[rgba(232,228,220,0.65)] leading-relaxed">{conflictData.message}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--ax-border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-xs text-[rgba(var(--ax-text-rgb),0.55)] space-y-1.5">
                  <p><span className="text-[rgba(var(--ax-text-rgb),0.35)]">Email:</span> <span className="font-medium text-[var(--ax-text)]">{email}</span></p>
                  <p><span className="text-[rgba(var(--ax-text-rgb),0.35)]">Registered as:</span> <span className="font-medium text-[var(--ax-text)]">{ROLE_LABELS[conflictData.userPreferredRole] ?? conflictData.userPreferredRole}</span></p>
                  <p><span className="text-[rgba(var(--ax-text-rgb),0.35)]">You're assigning:</span> <span className="font-medium text-[var(--ax-accent)]">Vendor</span></p>
                </div>
                <p className="text-xs text-[rgba(var(--ax-text-rgb),0.4)]">
                  If you confirm, this user will receive an email explaining the change and must accept before being added to the project.
                </p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => setConflictData(null)}
                    disabled={submitting}
                    style={{ background: 'transparent', border: '1px solid var(--ax-border)', color: 'rgba(var(--ax-text-rgb),0.7)' }}
                  >
                    Go Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={submitting}
                    onClick={handleConfirmConflict}
                  >
                    {submitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                    ) : (
                      'Confirm & Invite'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <div className="bg-[rgba(220,80,60,0.1)] border border-[rgba(224,96,80,0.3)] rounded-lg p-3 flex items-start gap-2 text-sm text-[#e06050]">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{formError}</p>
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-[rgba(50,200,120,0.1)] border border-[rgba(92,186,128,0.3)] rounded-lg p-3 flex items-start gap-2 text-sm text-[#5cba80]">
                    <Check className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{formSuccess}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[var(--ax-text)] mb-1">
                    Email Address *
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vendor@company.com"
                    required
                  />
                  <p className="text-xs text-[rgba(var(--ax-text-rgb),0.35)] mt-1">
                    If they&apos;re not on Axinfra yet, they&apos;ll receive an invitation link.
                  </p>
                </div>

                <div className="pt-1">
                  <p className="text-xs text-[rgba(var(--ax-text-rgb),0.55)] mb-3">
                    Assigning to:{' '}
                    <span className="font-medium text-[var(--ax-text)]">{currentProjectName}</span> as{' '}
                    <span className="font-medium text-[var(--ax-accent)]">VENDOR</span>
                  </p>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Invite Vendor
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Vendor list */}
        <div className="lg:col-span-3">
          <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-[var(--ax-text)]">
                Vendors in {currentProjectName}
              </h2>
              <span className="text-xs text-[rgba(var(--ax-text-rgb),0.35)]">
                {vendors.length} vendor{vendors.length !== 1 ? 's' : ''}
              </span>
            </div>

            {vendorsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-[rgba(var(--ax-text-rgb),0.35)]" />
              </div>
            ) : vendors.length === 0 ? (
              <div className="text-center py-10">
                <Users className="w-8 h-8 text-[rgba(var(--ax-text-rgb),0.25)] mx-auto mb-2" />
                <p className="text-sm text-[rgba(var(--ax-text-rgb),0.35)]">No vendors assigned yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--ax-border)]">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider">
                        Name
                      </th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider">
                        Email
                      </th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-[rgba(var(--ax-text-rgb),0.55)] uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((v, idx) => (
                      <tr
                        key={v.userId ?? v.inviteId ?? idx}
                        className="border-b border-[var(--ax-border-subtle)] last:border-0 hover:bg-[var(--ax-overlay)]"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            {v.isPendingInvite ? (
                              <div className="w-7 h-7 rounded-full bg-[rgba(196,163,90,0.1)] flex items-center justify-center shrink-0">
                                <Clock className="w-3.5 h-3.5 text-[var(--ax-accent)]" />
                              </div>
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-[rgba(50,200,120,0.1)] flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-semibold text-[#5cba80]">
                                  {v.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </span>
                              </div>
                            )}
                            <span className={`font-medium ${v.isPendingInvite ? 'text-[rgba(var(--ax-text-rgb),0.45)] italic' : 'text-[var(--ax-text)]'}`}>
                              {v.isPendingInvite ? 'Pending Invite' : v.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[rgba(var(--ax-text-rgb),0.55)] font-mono text-xs">
                          {v.email}
                        </td>
                        <td className="py-3 px-3 text-xs">
                          {v.isPendingInvite ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(196,163,90,0.1)] border border-[rgba(196,163,90,0.2)] text-[var(--ax-accent)]">
                              <Clock className="w-3 h-3" />
                              Invite sent
                            </span>
                          ) : (
                            <span className="text-[rgba(var(--ax-text-rgb),0.35)]">
                              {formatDate(v.assignedAt)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
