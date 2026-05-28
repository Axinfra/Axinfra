'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';

// ── Types ────────────────────────────────────────────────────────────────────

type AssignedUser = { email: string; status: 'pending' | 'success' | 'error'; message?: string };

interface RoleSection {
  role: 'PMC' | 'ARTIFACTS';
  label: string;
  description: string;
  icon: React.ReactNode;
  assigned: AssignedUser[];
}

// ── Icon helpers ─────────────────────────────────────────────────────────────

function PMCIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
    </svg>
  );
}

function ArchitectsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewProjectPage() {
  const router = useRouter();

  // ── Step 1 state ────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // ── Step 2 state ────────────────────────────────────────────────────────
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [pmcEmail, setPmcEmail] = useState('');
  const [artifactsEmail, setArtifactsEmail] = useState('');
  const [assignedPMC, setAssignedPMC] = useState<AssignedUser[]>([]);
  const [assignedArtifacts, setAssignedArtifacts] = useState<AssignedUser[]>([]);
  const [addingPMC, setAddingPMC] = useState(false);
  const [addingArtifacts, setAddingArtifacts] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // ── Step 1: Create project ───────────────────────────────────────────────
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });

      const data = await res.json();

      if (data.success) {
        setProjectId(data.data.id);
        setProjectName(data.data.name);
        setStep(2);
      } else {
        setCreateError(data.error || 'Failed to create project');
      }
    } catch {
      setCreateError('An error occurred. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  // ── Step 2: Assign a single role by email ────────────────────────────────
  const assignRole = async (
    email: string,
    role: 'PMC' | 'ARTIFACTS',
    setAdding: (v: boolean) => void,
    setList: React.Dispatch<React.SetStateAction<AssignedUser[]>>,
    clearInput: () => void,
  ) => {
    if (!email.trim()) return;

    // Prevent duplicates
    const alreadyAdded =
      (role === 'PMC' ? assignedPMC : assignedArtifacts).some((u) => u.email === email.trim());
    if (alreadyAdded) return;

    setAdding(true);
    const entry: AssignedUser = { email: email.trim(), status: 'pending' };
    setList((prev) => [...prev, entry]);
    clearInput();

    try {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();

      setList((prev) =>
        prev.map((u) =>
          u.email === email.trim()
            ? { ...u, status: data.success ? 'success' : 'error', message: data.error }
            : u,
        ),
      );
    } catch {
      setList((prev) =>
        prev.map((u) =>
          u.email === email.trim()
            ? { ...u, status: 'error', message: 'Network error' }
            : u,
        ),
      );
    } finally {
      setAdding(false);
    }
  };

  const removeFromList = (
    email: string,
    setList: React.Dispatch<React.SetStateAction<AssignedUser[]>>,
  ) => setList((prev) => prev.filter((u) => u.email !== email));

  // ── Step 2: Finish → go to project ──────────────────────────────────────
  const handleFinish = () => {
    setFinishing(true);
    router.push(`/projects/${projectId}`);
  };

  // ── Shared role-invite section renderer ─────────────────────────────────
  const renderRoleSection = ({
    role,
    label,
    description: desc,
    icon,
    assigned,
  }: RoleSection) => {
    const isPMC = role === 'PMC';
    const email = isPMC ? pmcEmail : artifactsEmail;
    const setEmail = isPMC ? setPmcEmail : setArtifactsEmail;
    const adding = isPMC ? addingPMC : addingArtifacts;
    const setAdding = isPMC ? setAddingPMC : setAddingArtifacts;
    const setList = isPMC ? setAssignedPMC : setAssignedArtifacts;

    return (
      <div key={role} className="card">
        <div className="card-header">
          <div className="flex items-center gap-2.5">
            <span className="text-[rgba(232,228,220,0.55)]">{icon}</span>
            <div>
              <h3 className="font-semibold text-[#e8e4dc]">{label}</h3>
              <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5">{desc}</p>
            </div>
          </div>
        </div>
        <div className="card-body space-y-3">
          {/* Email input row */}
          <div className="flex gap-2">
            <input
              type="email"
              className="input flex-1"
              placeholder={`user@example.com`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void assignRole(email, role, setAdding, setList, () => setEmail(''));
                }
              }}
              disabled={adding}
            />
            <button
              type="button"
              disabled={adding || !email.trim()}
              onClick={() => void assignRole(email, role, setAdding, setList, () => setEmail(''))}
              className="btn btn-primary whitespace-nowrap disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>

          {/* Assigned list */}
          {assigned.length > 0 && (
            <ul className="space-y-2">
              {assigned.map((u) => (
                <li
                  key={u.email}
                  className="flex items-center justify-between rounded-lg px-3 py-2
                             bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {u.status === 'pending' && (
                      <span className="inline-block w-2 h-2 rounded-full bg-[rgba(232,228,220,0.3)] animate-pulse shrink-0" />
                    )}
                    {u.status === 'success' && (
                      <svg className="w-4 h-4 text-[#6ee7b7] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                    {u.status === 'error' && (
                      <svg className="w-4 h-4 text-[#e06050] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                      </svg>
                    )}
                    <span className="text-sm text-[#e8e4dc] truncate">{u.email}</span>
                    {u.status === 'error' && u.message && (
                      <span className="text-xs text-[#e06050] truncate">— {u.message}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromList(u.email, setList)}
                    className="text-[rgba(232,228,220,0.35)] hover:text-[#e06050] ml-3 shrink-0 transition-colors"
                    aria-label="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-3xl mx-auto">

        {/* ── Back link ─────────────────────────────────────────────────── */}
        <div className="mb-8">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Projects
          </Link>
        </div>

        {/* ── Step indicator ────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-8">
          {/* Step 1 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold
              ${step === 1
                ? 'bg-[#c9a84c] text-[#0e1016]'
                : 'bg-[#6ee7b7] text-[#0e1016]'
              }`}
            >
              {step === 1 ? '1' : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              )}
            </div>
            <span className={`text-sm font-medium ${step === 1 ? 'text-[#e8e4dc]' : 'text-[rgba(232,228,220,0.55)]'}`}>
              Project Details
            </span>
          </div>

          <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />

          {/* Step 2 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold
              ${step === 2
                ? 'bg-[#c9a84c] text-[#0e1016]'
                : 'bg-[rgba(255,255,255,0.08)] text-[rgba(232,228,220,0.4)]'
              }`}
            >
              2
            </div>
            <span className={`text-sm font-medium ${step === 2 ? 'text-[#e8e4dc]' : 'text-[rgba(232,228,220,0.4)]'}`}>
              Assign Roles
            </span>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            STEP 1 — Project Details
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-[#e8e4dc]">Create New Project</h1>
              <p className="text-[rgba(232,228,220,0.55)] mt-1">
                Set up a new project to manage milestones, BOQs, and payments.
              </p>
            </div>

            {createError && <div className="alert alert-error mb-6">{createError}</div>}

            <form onSubmit={handleCreateProject}>
              <div className="card">
                <div className="card-header">
                  <h2 className="font-semibold">Project Details</h2>
                </div>
                <div className="card-body space-y-5">
                  <div>
                    <label htmlFor="name" className="label">
                      Project Name *
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Office Tower Phase 2"
                    />
                  </div>

                  <div>
                    <label htmlFor="description" className="label">
                      Description
                    </label>
                    <textarea
                      id="description"
                      rows={3}
                      className="input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the project scope, location, or objectives..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-6 pb-10">
                <Link href="/projects" className="btn btn-secondary">
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {creating ? 'Creating…' : (
                    <>
                      Next: Assign Roles
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP 2 — Assign Roles
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <>
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                             bg-[rgba(110,231,183,0.12)] text-[#6ee7b7] border border-[rgba(110,231,183,0.2)] mb-3">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Project created
              </div>
              <h1 className="text-2xl font-bold text-[#e8e4dc]">Assign Your Team</h1>
              <p className="text-[rgba(232,228,220,0.55)] mt-1">
                Invite team members to <span className="text-[#e8e4dc] font-medium">{projectName}</span>.
                You can skip this and add members later from the Roles page.
              </p>
            </div>

            <div className="space-y-4">
              {renderRoleSection({
                role: 'PMC',
                label: 'PMC — Project Management Consultant',
                description: 'Creates & reviews BOQ, verifies milestones, reviews evidence, blocks payments.',
                icon: <PMCIcon />,
                assigned: assignedPMC,
              })}

              {renderRoleSection({
                role: 'ARTIFACTS',
                label: 'Architects — Document Controller',
                description: 'Manages project documents, drawings, and deliverables. Can review submitted evidence.',
                icon: <ArchitectsIcon />,
                assigned: assignedArtifacts,
              })}
            </div>

            {/* Summary counts */}
            {(assignedPMC.length > 0 || assignedArtifacts.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {assignedPMC.filter((u) => u.status === 'success').length > 0 && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.7)]">
                    {assignedPMC.filter((u) => u.status === 'success').length} PMC added
                  </span>
                )}
                {assignedArtifacts.filter((u) => u.status === 'success').length > 0 && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.7)]">
                    {assignedArtifacts.filter((u) => u.status === 'success').length} Architects added
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-8 pb-10">
              <button
                type="button"
                onClick={handleFinish}
                disabled={finishing}
                className="btn btn-secondary text-sm"
              >
                Skip &amp; Go to Project
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={finishing}
                className="btn btn-primary disabled:opacity-50 inline-flex items-center gap-2"
              >
                {finishing ? 'Opening…' : (
                  <>
                    Go to Project
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
