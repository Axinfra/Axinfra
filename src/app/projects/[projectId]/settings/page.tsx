'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<any>(null);
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('ONGOING');

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();

      if (data.success) {
        setProject(data.data);
        setMyRole(data.data.myRole);
        setName(data.data.name);
        setDescription(data.data.description || '');
        setStatus(data.data.status || 'ONGOING');
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, status }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Project updated successfully');
        setProject({ ...project, ...data.data });
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();

      if (data.success) {
        setStatus(newStatus);
        setSuccess(`Project marked as ${newStatus.toLowerCase()}`);
        setProject({ ...project, status: newStatus });
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== project?.name) {
      setError('Please type the project name correctly to confirm deletion');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        router.push('/projects');
      } else {
        setError(data.error);
        setShowDeleteConfirm(false);
      }
    } catch {
      setError('Failed to delete project');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  // Only OWNER can access settings
  if (myRole !== 'OWNER') {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={project?.name || ''} role={myRole} />
        <div className="alert alert-error">
          Access denied. Only the project owner can access settings.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={project?.name || ''} role={myRole} />

      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Project Settings</h1>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            status === 'COMPLETED'
              ? 'bg-green-100 text-green-800'
              : 'bg-blue-100 text-blue-800'
          }`}>
            {status === 'COMPLETED' ? 'Completed' : 'Ongoing'}
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {/* Project Details Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Project Details</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="label">Project Name *</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Project Status Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Project Status</h2>
          </div>
          <div className="card-body">
            <p className="text-sm text-gray-600 mb-4">
              Change the project status. Marking as completed indicates that all work is finished.
            </p>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleStatusChange('ONGOING')}
                disabled={saving || status === 'ONGOING'}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  status === 'ONGOING'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Ongoing
              </button>
              <button
                onClick={() => handleStatusChange('COMPLETED')}
                disabled={saving || status === 'COMPLETED'}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  status === 'COMPLETED'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Completed
              </button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="card border-red-200">
          <div className="card-header bg-red-50">
            <h2 className="font-semibold text-red-700">Danger Zone</h2>
          </div>
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Delete this project</p>
                <p className="text-sm text-gray-500">
                  Once deleted, this project and all its data cannot be recovered.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn bg-red-600 text-white hover:bg-red-700"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-red-600">Delete Project</h2>
              <p className="text-gray-600 mb-4">
                This action <strong>cannot be undone</strong>. This will permanently delete the
                project <strong>{project?.name}</strong> and all associated data including
                milestones, BOQs, evidence, and audit logs.
              </p>
              <div className="mb-4">
                <label className="label">
                  Type <strong>{project?.name}</strong> to confirm:
                </label>
                <input
                  type="text"
                  className="input"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Enter project name"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving || deleteConfirmText !== project?.name}
                  className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
