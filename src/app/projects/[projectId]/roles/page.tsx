'use client';

import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { AlertTriangle, Clock, Mail } from 'lucide-react';

interface RoleEntry {
  userId: string | null;
  inviteId?: string;
  name: string;
  email: string;
  role: string;
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
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<string | null>(null);
  const [confirmCancelInviteId, setConfirmCancelInviteId] = useState<string | null>(null);

  const ROLE_LABELS: Record<string, string> = {
    CLIENT: 'Project Owner', PMC: 'PMC', VENDOR: 'Vendor', CONSULTANT: 'Consultant', VIEWER: 'Viewer',
  };

  const submitRole = async (force: boolean) => {
    setAddError('');
    setAddSuccess('');
    setAdding(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, role: newRole, force }),
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
    setConflictData(null);
    void submitRole(false);
  };

  const handleConfirmConflict = () => {
    void submitRole(true);
  };

  const handleRemoveRole = async (userId: string) => {
    setConfirmRemoveUserId(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
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
            <button onClick={() => { setShowAddModal(true); setAddSuccess(''); setAddError(''); setConflictData(null); }} className="btn btn-primary">
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
                  <th>Added</th>
                  {myRole === 'CLIENT' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {roles.map((entry) => (
                  <tr key={entry.isPendingInvite ? `invite-${entry.inviteId}` : entry.userId!}>
                    <td className="font-medium">
                      {entry.isPendingInvite ? (
                        <span className="flex items-center gap-2 text-[rgba(232,228,220,0.45)]">
                          <Clock className="w-3.5 h-3.5 text-[var(--ax-accent)] shrink-0" />
                          Pending Invite
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
                        <span className="badge badge-draft">{entry.role}</span>
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
                    <td className="text-[rgba(232,228,220,0.55)]">{formatDate(entry.createdAt)}</td>
                    {myRole === 'CLIENT' && (
                      <td>
                        {entry.isPendingInvite ? (
                          <button
                            onClick={() => setConfirmCancelInviteId(entry.inviteId!)}
                            className="text-[rgba(232,228,220,0.4)] hover:text-[#e06050] text-sm transition-colors"
                          >
                            Cancel Invite
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmRemoveUserId(entry.userId!)}
                            className="text-[#e06050] hover:text-[#c8503f] text-sm"
                          >
                            Remove
                          </button>
                        )}
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
                  <li>Approve BOQ (cannot create)</li>
                  <li>Verify milestones</li>
                  <li>Block/Unblock payments</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">PMC</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Create &amp; edit BOQ (cannot approve)</li>
                  <li>Review &amp; manage evidence</li>
                  <li>Verify milestones</li>
                  <li>Block payments</li>
                  <li>Manage project architect deliverables</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">CONSULTANTS</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Upload &amp; manage project documents</li>
                  <li>Review submitted evidence (read)</li>
                  <li>Export audit log</li>
                  <li>View milestones &amp; phases (read-only)</li>
                  <li>No payment or BOQ control</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">VENDOR</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Submit evidence</li>
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
            </div>
          </div>
        </div>
      </div>

      {/* Remove User confirmation modal */}
      {confirmRemoveUserId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e06050]">Remove User</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4 text-sm">
                Are you sure you want to remove{' '}
                <span className="font-medium text-[#e8e4dc]">
                  {roles.find((r) => r.userId === confirmRemoveUserId)?.name ?? 'this user'}
                </span>{' '}
                from the project?
              </p>
              {error && <div className="alert alert-error mb-3 text-sm">{error}</div>}
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmRemoveUserId(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={() => void handleRemoveRole(confirmRemoveUserId)}
                  className="btn bg-[#e06050] text-white hover:bg-[#c8503f]"
                >
                  Remove User
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
                      onClick={() => { setShowAddModal(false); setNewEmail(''); setNewRole('PMC'); setAddSuccess(''); }}
                      className="btn btn-secondary"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => { setAddSuccess(''); setNewEmail(''); }}
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
                    </select>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => { setShowAddModal(false); setAddError(''); setConflictData(null); }}
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
