'use client';

import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { AlertTriangle, Clock, Mail, Pencil } from 'lucide-react';

interface PurchaseOrderOption {
  id: string;
  name: string;
  vendorUserId: string | null;
}

interface RoleEntry {
  userId: string | null;
  inviteId?: string;
  name: string;
  email: string;
  role: string;
  fee: number | null;
  createdAt: string;
  isPendingInvite: boolean;
}

export default function RolesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [error, setError] = useState('');

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const currency = project?.currency ?? 'INR';

  const {
    data: roles = [],
    isLoading: rolesLoading,
    mutate: refetchRoles,
  } = useSWR<RoleEntry[]>(
    projectId ? `/api/projects/${projectId}/roles` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );
  const loading = projectLoading || rolesLoading;

  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('PMC');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [adding, setAdding] = useState(false);
  const [conflictData, setConflictData] = useState<{ userPreferredRole: string; message: string } | null>(null);
  // A user can hold several roles on this project now, so identifying which row to remove
  // needs both the userId and the specific role — not userId alone.
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; role: string } | null>(null);
  const [confirmCancelInviteId, setConfirmCancelInviteId] = useState<string | null>(null);

  // Consultant name + fee — fee is required before a consultant is added to the project;
  // name is an optional display label (only meaningful pre-acceptance). Both stay editable
  // afterward, whether they're an accepted role (userId) or still a pending invite (inviteId).
  const [newFee, setNewFee] = useState('');
  const [newConsultantName, setNewConsultantName] = useState('');
  const [editTarget, setEditTarget] = useState<{ userId?: string; inviteId?: string; displayName: string } | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editFeeValue, setEditFeeValue] = useState('');
  const [editFeeError, setEditFeeError] = useState('');
  const [savingFee, setSavingFee] = useState(false);

  // Vendor onboarding — two options: assign straight to a Purchase Order (richer email,
  // vendor lands pre-assigned) or a plain project-wide email invite (today's original flow).
  const [onboardMode, setOnboardMode] = useState<'EMAIL' | 'PO'>('EMAIL');
  const [selectedPhaseId, setSelectedPhaseId] = useState('');
  const { data: allPhases = [] } = useSWR<PurchaseOrderOption[]>(
    showAddModal && newRole === 'VENDOR' ? `/api/projects/${projectId}/phases` : null,
    jsonFetcher,
  );
  const unassignedPhases = allPhases.filter((p) => !p.vendorUserId);

  const ROLE_LABELS: Record<string, string> = {
    CLIENT: 'Project Owner', PMC: 'PMC', VENDOR: 'Vendor', CONSULTANT: 'Consultant', VIEWER: 'Viewer',
    SITE_ENGINEER: 'Site Engineer',
  };

  const submitRole = async (force: boolean) => {
    setAddError('');
    setAddSuccess('');
    setAdding(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          role: newRole,
          force,
          phaseId: newRole === 'VENDOR' && onboardMode === 'PO' ? selectedPhaseId || undefined : undefined,
          fee: newRole === 'CONSULTANT' ? Number(newFee) : undefined,
          name: newRole === 'CONSULTANT' ? newConsultantName.trim() || undefined : undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setConflictData(null);
        if (data.invited) {
          setAddSuccess(data.message ?? 'Invitation sent!');
        } else {
          setShowAddModal(false);
          setNewEmail('');
          setNewRole('PMC');
          setNewFee('');
          setNewConsultantName('');
        }
        void refetchRoles();
      } else if (data.conflict) {
        setConflictData({ userPreferredRole: data.userPreferredRole, message: data.error });
      } else {
        setAddError(data.error);
      }
    } catch {
      setAddError('Failed to add role');
    } finally {
      setAdding(false);
    }
  };

  const handleAddRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRole === 'VENDOR' && onboardMode === 'PO' && !selectedPhaseId) {
      setAddError('Pick a Purchase Order to assign, or switch to Email Invite.');
      return;
    }
    if (newRole === 'CONSULTANT' && !(Number(newFee) > 0)) {
      setAddError('Set the consultant fee before adding them to the project.');
      return;
    }
    setConflictData(null);
    void submitRole(false);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const fee = Number(editFeeValue);
    if (!(fee > 0)) {
      setEditFeeError('Enter a fee greater than 0.');
      return;
    }
    setEditFeeError('');
    setSavingFee(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editTarget.userId,
          inviteId: editTarget.inviteId,
          fee,
          // Name is only editable for a still-pending invite — an accepted consultant's
          // name comes from their own account.
          name: editTarget.inviteId ? (editNameValue.trim() || undefined) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditTarget(null);
        void refetchRoles();
      } else {
        setEditFeeError(data.error ?? 'Failed to save changes');
      }
    } catch {
      setEditFeeError('Failed to save changes');
    } finally {
      setSavingFee(false);
    }
  };

  const handleConfirmConflict = () => {
    void submitRole(true);
  };

  const handleRemoveRole = async (userId: string, role: string) => {
    setConfirmRemove(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      if (data.success) {
        void refetchRoles();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to remove role');
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    setConfirmCancelInviteId(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      const data = await res.json();
      if (data.success) {
        void refetchRoles();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to cancel invite');
    }
  };

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Project Roles</h1>
          {myRole === 'CLIENT' && (
            <button onClick={() => { setShowAddModal(true); setAddSuccess(''); setAddError(''); setConflictData(null); setOnboardMode('EMAIL'); setSelectedPhaseId(''); setNewFee(''); setNewConsultantName(''); }} className="btn btn-primary">
              Add User
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="card">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Fee</th>
                  <th>Added</th>
                  {myRole === 'CLIENT' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {roles.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-[rgba(232,228,220,0.4)]">No team members yet</td></tr>
                )}
                {roles.map((entry) => (
                  // A user can hold several roles on this project now — userId alone is no
                  // longer a unique key (see ProjectRole's @@unique([projectId, userId, role])).
                  <tr key={entry.isPendingInvite ? `invite-${entry.inviteId}` : `${entry.userId}-${entry.role}`}>
                    <td className="font-medium">
                      {entry.isPendingInvite ? (
                        <span className="flex items-center gap-2 text-[rgba(232,228,220,0.45)]">
                          <Clock className="w-3.5 h-3.5 text-[var(--ax-accent)] shrink-0" />
                          {entry.name}
                        </span>
                      ) : (
                        entry.name
                      )}
                    </td>
                    <td className="text-[rgba(232,228,220,0.55)]">
                      <span className="flex items-center gap-1.5">
                        {entry.isPendingInvite && <Mail className="w-3 h-3 text-[rgba(232,228,220,0.35)] shrink-0" />}
                        {entry.email}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-draft">{entry.role === 'SITE_ENGINEER' ? 'SITE ENGINEER' : entry.role}</span>
                        {entry.isPendingInvite && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{
                              background: 'rgba(var(--ax-accent-rgb),0.1)',
                              color: 'var(--ax-accent)',
                              border: '1px solid rgba(var(--ax-accent-rgb),0.25)',
                            }}
                          >
                            <Clock className="w-2.5 h-2.5" />
                            Invited
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-[rgba(232,228,220,0.55)]">
                      {entry.role === 'CONSULTANT'
                        ? (entry.fee != null ? formatCurrency(entry.fee, currency) : <span className="text-[#e09840]">Not set</span>)
                        : '—'}
                    </td>
                    <td className="text-[rgba(232,228,220,0.55)]">{formatDate(entry.createdAt)}</td>
                    {myRole === 'CLIENT' && (
                      <td>
                        <div className="flex items-center gap-3">
                          {entry.role === 'CONSULTANT' && (
                            <button
                              onClick={() => {
                                setEditTarget(
                                  entry.isPendingInvite
                                    ? { inviteId: entry.inviteId!, displayName: entry.email }
                                    : { userId: entry.userId!, displayName: entry.name }
                                );
                                setEditNameValue(entry.isPendingInvite && entry.name !== 'Pending Invite' ? entry.name : '');
                                setEditFeeValue(entry.fee != null ? String(entry.fee) : '');
                                setEditFeeError('');
                              }}
                              className="inline-flex items-center gap-1 text-[var(--ax-accent)] hover:opacity-80 text-sm"
                              title="Edit consultant"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                          )}
                          {entry.isPendingInvite ? (
                            <button
                              onClick={() => setConfirmCancelInviteId(entry.inviteId!)}
                              className="text-[rgba(232,228,220,0.4)] hover:text-[#e06050] text-sm transition-colors"
                            >
                              Cancel Invite
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmRemove({ userId: entry.userId!, role: entry.role })}
                              className="text-[#e06050] hover:text-[#c8503f] text-sm"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Role permissions card */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Role Permissions</h2>
          </div>
          <div className="card-body">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">OWNER</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Full project access</li>
                  <li>Manage roles &amp; assign team</li>
                  <li>Approve Orders (cannot create)</li>
                  <li>Verify milestones</li>
                  <li>Block/Unblock payments</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">PMC</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Create &amp; edit Orders (cannot approve)</li>
                  <li>Verify milestones</li>
                  <li>Block payments</li>
                  <li>Manage project architect deliverables</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">CONSULTANTS</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Upload &amp; manage project documents</li>
                  <li>Export audit log</li>
                  <li>View milestones &amp; phases (read-only)</li>
                  <li>No payment or Order control</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">VENDOR</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Submit milestones for verification</li>
                  <li>View payment status (read-only)</li>
                  <li>Cannot approve own work</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">VIEWER</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Read-only access</li>
                  <li>No control actions</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">SITE ENGINEER</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Same view as PMC: Orders, Schedule, Activities, RA Bills</li>
                  <li>No Analysis, Payments, or Audit Log access</li>
                  <li>Read-only — no edit, approve, or create actions</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Remove User confirmation modal */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e06050]">Remove Role</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4 text-sm">
                Are you sure you want to remove the{' '}
                <span className="font-medium text-[#e8e4dc]">
                  {ROLE_LABELS[confirmRemove.role] ?? confirmRemove.role}
                </span>{' '}
                role from{' '}
                <span className="font-medium text-[#e8e4dc]">
                  {roles.find((r) => r.userId === confirmRemove.userId && r.role === confirmRemove.role)?.name ?? 'this user'}
                </span>
                ? {roles.filter((r) => r.userId === confirmRemove.userId).length > 1
                  ? 'Their other role(s) on this project are unaffected.'
                  : 'They will lose access to this project.'}
              </p>
              {error && <div className="alert alert-error mb-3 text-sm">{error}</div>}
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmRemove(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={() => void handleRemoveRole(confirmRemove.userId, confirmRemove.role)}
                  className="btn bg-[#e06050] text-white hover:bg-[#c8503f]"
                >
                  Remove Role
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Invite confirmation modal */}
      {confirmCancelInviteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e06050]">Cancel Invitation</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4 text-sm">
                Cancel the pending invite for{' '}
                <span className="font-medium text-[#e8e4dc]">
                  {roles.find((r) => r.inviteId === confirmCancelInviteId)?.email ?? 'this user'}
                </span>
                ? They will no longer be able to use the invite link.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmCancelInviteId(null)} className="btn btn-secondary">
                  Keep Invite
                </button>
                <button
                  onClick={() => void handleCancelInvite(confirmCancelInviteId)}
                  className="btn bg-[#e06050] text-white hover:bg-[#c8503f]"
                >
                  Cancel Invite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Consultant modal — works for an already-accepted Consultant (userId, fee only)
          or one still sitting as a Pending Invite (inviteId, name + fee) */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2">Edit Consultant</h2>
              <p className="text-xs text-[rgba(232,228,220,0.4)] mb-4">
                <span className="font-medium text-[#e8e4dc]">{editTarget.displayName}</span>
              </p>
              {editFeeError && <div className="alert alert-error mb-3 text-sm">{editFeeError}</div>}
              <div className="space-y-4">
                {editTarget.inviteId && (
                  <div>
                    <label htmlFor="editName" className="label">Name (optional)</label>
                    <input
                      id="editName"
                      type="text"
                      className="input"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      placeholder="e.g. Structural Consultants Pvt Ltd"
                      maxLength={200}
                      autoFocus
                    />
                    <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                      Shown until they accept the invite — their real name takes over after that.
                    </p>
                  </div>
                )}
                <div>
                  <label htmlFor="editFee" className="label">Fee ({currency})</label>
                  <input
                    id="editFee"
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={editFeeValue}
                    onChange={(e) => setEditFeeValue(e.target.value)}
                    placeholder="e.g. 50000"
                    autoFocus={!editTarget.inviteId}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setEditTarget(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={() => void handleSaveEdit()}
                  disabled={savingFee}
                  className="btn btn-primary"
                >
                  {savingFee ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-1">Add User to Project</h2>
              <p className="text-xs text-[rgba(232,228,220,0.4)] mb-4">
                If the user has an account, they&apos;ll be added immediately. If not, an invitation email will be sent.
              </p>

              {addSuccess ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(92,186,128,0.08)] border border-[rgba(92,186,128,0.2)]">
                    <div className="w-8 h-8 rounded-full bg-[rgba(92,186,128,0.12)] flex items-center justify-center shrink-0 mt-0.5">
                      <Mail className="w-4 h-4 text-[#5cba80]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#5cba80] mb-1">Invitation sent!</p>
                      <p className="text-xs text-[rgba(232,228,220,0.55)] leading-relaxed">{addSuccess}</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => { setShowAddModal(false); setNewEmail(''); setNewRole('PMC'); setAddSuccess(''); setOnboardMode('EMAIL'); setSelectedPhaseId(''); }}
                      className="btn btn-secondary"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => { setAddSuccess(''); setNewEmail(''); setSelectedPhaseId(''); }}
                      className="btn btn-primary"
                    >
                      Invite Another
                    </button>
                  </div>
                </div>
              ) : conflictData ? (
                /* Role conflict confirmation step */
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(224,152,64,0.07)] border border-[rgba(224,152,64,0.22)]">
                    <AlertTriangle className="w-5 h-5 text-[#e09840] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-[#e09840] mb-1">Role Mismatch</p>
                      <p className="text-xs text-[rgba(232,228,220,0.65)] leading-relaxed">{conflictData.message}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-xs text-[rgba(232,228,220,0.55)] space-y-1">
                    <p><span className="text-[rgba(232,228,220,0.35)]">Email:</span> <span className="font-medium text-[#e8e4dc]">{newEmail}</span></p>
                    <p><span className="text-[rgba(232,228,220,0.35)]">Registered as:</span> <span className="font-medium text-[#e8e4dc]">{ROLE_LABELS[conflictData.userPreferredRole] ?? conflictData.userPreferredRole}</span></p>
                    <p><span className="text-[rgba(232,228,220,0.35)]">You're assigning:</span> <span className="font-medium text-[var(--ax-accent)]">{ROLE_LABELS[newRole] ?? newRole}</span></p>
                  </div>
                  <p className="text-xs text-[rgba(232,228,220,0.4)]">
                    If you confirm, the user will receive an email explaining the change and must accept the invitation before they are added to the project.
                  </p>
                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setConflictData(null)}
                      className="btn btn-secondary"
                    >
                      Go Back
                    </button>
                    <button
                      type="button"
                      disabled={adding}
                      onClick={handleConfirmConflict}
                      className="btn btn-primary"
                    >
                      {adding ? 'Sending…' : 'Confirm & Invite'}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAddRole} className="space-y-4">
                  {addError && <div className="alert alert-error">{addError}</div>}

                  <div>
                    <label htmlFor="email" className="label">User Email</label>
                    <input
                      id="email"
                      type="email"
                      required
                      className="input"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="user@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="role" className="label">Role</label>
                    <select
                      id="role"
                      className="input"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                    >
                      <option value="PMC">PMC</option>
                      <option value="CONSULTANT">Consultants</option>
                      <option value="VENDOR">Vendor</option>
                      <option value="VIEWER">Viewer</option>
                      <option value="SITE_ENGINEER">Site Engineer</option>
                    </select>
                  </div>

                  {newRole === 'CONSULTANT' && (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="consultantName" className="label">Consultant Name (optional)</label>
                        <input
                          id="consultantName"
                          type="text"
                          className="input"
                          value={newConsultantName}
                          onChange={(e) => setNewConsultantName(e.target.value)}
                          placeholder="e.g. Structural Consultants Pvt Ltd"
                          maxLength={200}
                        />
                        <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                          Shown until they accept the invite — editable anytime before or after.
                        </p>
                      </div>
                      <div>
                        <label htmlFor="consultantFee" className="label">Consultant Fee ({currency})</label>
                        <input
                          id="consultantFee"
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          className="input"
                          value={newFee}
                          onChange={(e) => setNewFee(e.target.value)}
                          placeholder="e.g. 50000"
                        />
                        <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                          Required before this consultant is added to the project — PMC will see this fee on the roles list.
                        </p>
                      </div>
                    </div>
                  )}

                  {newRole === 'VENDOR' && (
                    <div>
                      <label className="label">Onboarding</label>
                      <div className="inline-flex items-center bg-[rgba(255,255,255,0.05)] rounded-lg p-0.5 gap-0.5 mb-2">
                        {(['PO', 'EMAIL'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setOnboardMode(mode)}
                            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                              onboardMode === mode
                                ? 'bg-[rgba(var(--ax-accent-rgb),0.15)] text-[var(--ax-accent)]'
                                : 'text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]'
                            }`}
                          >
                            {mode === 'PO' ? 'Assign to Purchase Order' : 'Email Invite Only'}
                          </button>
                        ))}
                      </div>
                      {onboardMode === 'PO' && (
                        <div>
                          <select
                            className="input"
                            value={selectedPhaseId}
                            onChange={(e) => setSelectedPhaseId(e.target.value)}
                          >
                            <option value="">Select a Purchase Order…</option>
                            {unassignedPhases.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {unassignedPhases.length === 0 && (
                            <p className="text-xs text-[rgba(232,228,220,0.4)] mt-1.5">
                              No unassigned Purchase Orders in this project — create one first, or use Email Invite.
                            </p>
                          )}
                          <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                            The vendor's email will show this Purchase Order's dates, estimated cost, Work Order status, and Orders — and they'll be assigned to it as soon as they accept.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => { setShowAddModal(false); setAddError(''); setConflictData(null); setOnboardMode('EMAIL'); setSelectedPhaseId(''); setNewFee(''); setNewConsultantName(''); }}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={adding} className="btn btn-primary">
                      {adding ? 'Processing…' : 'Add / Invite'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
