'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertCircle, Loader2, Plus, Users, Eye, EyeOff, Check } from 'lucide-react';

interface ProjectOption {
  projectId: string;
  projectName: string;
  role: string;
}

interface VendorRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  assignedAt: string;
  userCreatedAt: string;
}

export default function VendorOnboardingPage() {
  const router = useRouter();

  // Auth / session
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Form
  const [selectedProject, setSelectedProject] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Vendor list
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);

  // Check auth — must be OWNER or PMC
  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) {
          router.push('/auth/login');
          return;
        }
        const adminProjects = (data.data.projectRoles || []).filter(
          (pr: ProjectOption) => pr.role === 'OWNER' || pr.role === 'PMC',
        );
        if (adminProjects.length === 0) {
          router.push('/projects');
          return;
        }
        setProjects(adminProjects);
        setSelectedProject(adminProjects[0].projectId);
        setIsAdmin(true);
      } catch {
        if (!cancelled) router.push('/auth/login');
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    checkAuth();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load vendors whenever project changes
  const loadVendors = useCallback(async () => {
    if (!selectedProject) return;
    setVendorsLoading(true);
    try {
      const res = await fetch(`/api/admin/vendors?projectId=${selectedProject}`);
      const data = await res.json();
      if (data.success) {
        setVendors(data.data);
      }
    } catch {
      // silent
    } finally {
      setVendorsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (selectedProject) loadVendors();
  }, [selectedProject, loadVendors]);

  // Create vendor
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setCreating(true);

    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          displayName,
          projectId: selectedProject,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFormSuccess(
          data.data.created
            ? `Vendor "${data.data.name}" created and assigned successfully.`
            : `Existing user "${data.data.name}" assigned as vendor.`,
        );
        setUsername('');
        setPassword('');
        setDisplayName('');
        loadVendors();
      } else {
        setFormError(data.error || 'Failed to create vendor');
      }
    } catch {
      setFormError('An error occurred');
    } finally {
      setCreating(false);
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[rgba(232,228,220,0.35)]" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-[rgba(232,228,220,0.55)]">Redirecting...</p>
        </div>
      </Layout>
    );
  }

  const currentProjectName =
    projects.find((p) => p.projectId === selectedProject)?.projectName ?? '';

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-[#c4a35a]" />
            <h1 className="text-xl font-semibold text-[#e8e4dc]">Vendor Onboarding</h1>
          </div>
          <p className="text-sm text-[rgba(232,228,220,0.55)]">
            Create vendor accounts and assign them to projects.
          </p>
        </div>

        {/* Project selector */}
        {projects.length > 1 && (
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-[#e8e4dc] mb-1.5">
              Project
            </label>
            <select
              className="w-full h-10 rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3 text-sm
                focus:outline-none focus:ring-4 focus:ring-[rgba(196,163,90,0.3)]/10 focus:border-[#c4a35a]
                transition-all duration-200"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
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
          {/* ─── Create Vendor Form ─── */}
          <div className="lg:col-span-2">
            <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Plus className="w-4 h-4 text-[#c4a35a]" />
                <h2 className="text-sm font-semibold text-[#e8e4dc]">New Vendor</h2>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                {formError && (
                  <div className="bg-[rgba(220,80,60,0.1)] border border-red-100 rounded-lg p-3 flex items-start gap-2 text-sm text-[#e06050]">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{formError}</p>
                  </div>
                )}
                {formSuccess && (
                  <div className="bg-[rgba(50,200,120,0.1)] border border-green-100 rounded-lg p-3 flex items-start gap-2 text-sm text-[#5cba80]">
                    <Check className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{formSuccess}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[#e8e4dc] mb-1">
                    Display Name *
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Apex Construction"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#e8e4dc] mb-1">
                    Username *
                  </label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. apex_construction"
                    required
                  />
                  <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1">
                    Login email will be <span className="font-mono">{username || 'username'}@vendor.local</span>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#e8e4dc] mb-1">
                    Password *
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,228,220,0.35)] hover:text-[rgba(232,228,220,0.55)]"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <p className="text-xs text-[rgba(232,228,220,0.55)] mb-3">
                    Assigning to: <span className="font-medium text-[#e8e4dc]">{currentProjectName}</span>
                    {' '}as <span className="font-medium text-[#c4a35a]">VENDOR</span>
                  </p>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={creating}
                  >
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Vendor
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>

          {/* ─── Vendor List ─── */}
          <div className="lg:col-span-3">
            <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-[#e8e4dc]">
                  Vendors in {currentProjectName}
                </h2>
                <span className="text-xs text-[rgba(232,228,220,0.35)]">
                  {vendors.length} vendor{vendors.length !== 1 ? 's' : ''}
                </span>
              </div>

              {vendorsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-[rgba(232,228,220,0.35)]" />
                </div>
              ) : vendors.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="w-8 h-8 text-surface-300 mx-auto mb-2" />
                  <p className="text-sm text-[rgba(232,228,220,0.35)]">No vendors assigned yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgba(255,255,255,0.07)]">
                        <th className="text-left py-2.5 px-3 text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">
                          Name
                        </th>
                        <th className="text-left py-2.5 px-3 text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">
                          Email
                        </th>
                        <th className="text-left py-2.5 px-3 text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">
                          Assigned
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendors.map((v) => (
                        <tr
                          key={v.userId}
                          className="border-b border-surface-50 last:border-0 hover:bg-[rgba(255,255,255,0.05)]/50"
                        >
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
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
                              <span className="font-medium text-[#e8e4dc]">{v.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[rgba(232,228,220,0.55)] font-mono text-xs">
                            {v.email}
                          </td>
                          <td className="py-3 px-3 text-[rgba(232,228,220,0.35)] text-xs">
                            {new Date(v.assignedAt).toLocaleDateString()}
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
    </Layout>
  );
}
