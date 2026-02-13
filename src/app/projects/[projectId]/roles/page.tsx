'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDate } from '@/lib/utils';

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
  const [roles, setRoles] = useState<Role[]>([]);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('VENDOR');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadRoles();
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    if (data.success) {
      setProjectName(data.data.name);
      setMyRole(data.data.myRole);
    }
  };

  const loadRoles = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/roles`);
      const data = await res.json();
      if (data.success) {
        setRoles(data.data);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

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
        loadRoles();
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
    if (!confirm('Are you sure you want to remove this user from the project?')) {
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (data.success) {
        loadRoles();
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
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Project Roles</h1>
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
                    <td className="text-gray-500">{role.email}</td>
                    <td>
                      <span className="badge badge-draft">{role.role}</span>
                    </td>
                    <td className="text-gray-500">{formatDate(role.createdAt)}</td>
                    {myRole === 'OWNER' && (
                      <td>
                        <button
                          onClick={() => handleRemoveRole(role.userId)}
                          className="text-red-600 hover:text-red-800 text-sm"
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
                <h3 className="font-medium text-gray-900 mb-2">OWNER</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>Full project access</li>
                  <li>Manage roles</li>
                  <li>Approve BOQ</li>
                  <li>Verify milestones</li>
                  <li>Block/Unblock payments</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">PMC</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>Edit BOQ (cannot approve)</li>
                  <li>Review evidence</li>
                  <li>Verify milestones</li>
                  <li>Block payments</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">VENDOR</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>Submit evidence</li>
                  <li>View payment status (read-only)</li>
                  <li>Cannot approve own work</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">VIEWER</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>Read-only access</li>
                  <li>No control actions</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
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
