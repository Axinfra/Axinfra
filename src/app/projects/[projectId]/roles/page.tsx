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

interface Role {
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
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
  } = useSWR<Role[]>(
    projectId ? `/api/projects/${projectId}/roles` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );
  const loading = projectLoading || rolesLoading;

  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('VENDOR');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<string | null>(null);

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAdding(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, role: newRole }),
      });

      const data = await res.json();

      if (data.success) {
        setShowAddModal(false);
        setNewEmail('');
        setNewRole('VENDOR');
        void refetchRoles();
      } else {
        setAddError(data.error);
      }
    } catch {
      setAddError('Failed to add role');
    } finally {
      setAdding(false);
    }
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
          {myRole === 'OWNER' && (
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
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
                  {myRole === 'OWNER' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.userId}>
                    <td className="font-medium">{role.name}</td>
                    <td className="text-[rgba(232,228,220,0.55)]">{role.email}</td>
                    <td>
                      <span className="badge badge-draft">{role.role}</span>
                    </td>
                    <td className="text-[rgba(232,228,220,0.55)]">{formatDate(role.createdAt)}</td>
                    {myRole === 'OWNER' && (
                      <td>
                        <button
                          onClick={() => setConfirmRemoveUserId(role.userId)}
                          className="text-[#e06050] hover:text-[#c8503f] text-sm"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Role Permissions</h2>
          </div>
          <div className="card-body">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">OWNER</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Full project access</li>
                  <li>Manage roles</li>
                  <li>Approve BOQ (cannot create)</li>
                  <li>Verify milestones</li>
                  <li>Block/Unblock payments</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[#e8e4dc] mb-2">PMC</h3>
                <ul className="text-sm text-[rgba(232,228,220,0.55)] space-y-1">
                  <li>Create &amp; edit BOQ (cannot approve)</li>
                  <li>Review evidence</li>
                  <li>Verify milestones</li>
                  <li>Block payments</li>
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
                <button
                  onClick={() => setConfirmRemoveUserId(null)}
                  className="btn btn-secondary"
                >
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

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Add User to Project</h2>
              <form onSubmit={handleAddRole} className="space-y-4">
                {addError && <div className="alert alert-error">{addError}</div>}

                <div>
                  <label htmlFor="email" className="label">
                    User Email
                  </label>
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
                  <label htmlFor="role" className="label">
                    Role
                  </label>
                  <select
                    id="role"
                    className="input"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="PMC">PMC</option>
                    <option value="VENDOR">Vendor</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={adding} className="btn btn-primary">
                    {adding ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
