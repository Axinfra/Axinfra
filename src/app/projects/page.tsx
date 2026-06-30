'use client';

import { ProjectsListSkeleton } from '@/components/ui/SkeletonPage';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import ClientOnly from '@/components/auth/ClientOnly';
import { formatDate } from '@/lib/utils';
import { Plus, Pencil, Trash2, X, Loader2, LayoutGrid, List } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  status?: string;
  isExampleProject?: boolean;
  myRole: string;
  milestoneCount: number;
  createdAt: string;
  metadata?: string;
}

interface ProjectForm {
  name: string;
  description: string;
  location: string;
  contractValue: string;
  startDate: string;
  endDate: string;
}

const emptyForm: ProjectForm = {
  name: '', description: '', location: '', contractValue: '', startDate: '', endDate: '',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProjects = useCallback(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProjects(data.data);
          const roles = data.data.map((p: Project) => p.myRole);
          if (roles.includes('CLIENT')) setUserRole('CLIENT');
          else if (roles.includes('PMC')) setUserRole('PMC');
          else if (roles.includes('VENDOR')) setUserRole('VENDOR');
          else if (roles.includes('VIEWER')) setUserRole('VIEWER');
          else if (data.preferredRole) setUserRole(data.preferredRole);
        } else {
          setError(data.error);
        }
      })
      .catch(() => setError('Failed to load projects'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const openCreateModal = () => {
    setEditingProject(null);
    setForm(emptyForm);
    setModalError('');
    setShowModal(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    const meta = project.metadata ? JSON.parse(project.metadata) : {};
    setForm({
      name: project.name || '',
      description: project.description || '',
      location: meta.location || '',
      contractValue: meta.contractValue ? String(meta.contractValue) : '',
      startDate: meta.startDate ? meta.startDate.split('T')[0] : '',
      endDate: meta.endDate ? meta.endDate.split('T')[0] : '',
    });
    setModalError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError('');

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        description: form.description || undefined,
      };
      if (form.location) body.location = form.location;
      if (form.contractValue) body.contractValue = parseFloat(form.contractValue);
      if (form.startDate) body.startDate = form.startDate;
      if (form.endDate) body.endDate = form.endDate;

      const url = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects';
      const method = editingProject ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save project');

      setShowModal(false);
      setToast(editingProject ? 'Project updated successfully' : 'Project created successfully');

      if (editingProject) {
        const meta = (form.location || form.contractValue || form.startDate || form.endDate)
          ? JSON.stringify({ location: form.location, contractValue: form.contractValue ? parseFloat(form.contractValue) : undefined, startDate: form.startDate, endDate: form.endDate })
          : undefined;
        setProjects((prev) =>
          prev.map((p) =>
            p.id === editingProject.id
              ? { ...p, name: form.name, description: form.description || undefined, metadata: meta }
              : p,
          ),
        );
      } else {
        const meta = (form.location || form.contractValue || form.startDate || form.endDate)
          ? JSON.stringify({ location: form.location, contractValue: form.contractValue ? parseFloat(form.contractValue) : undefined, startDate: form.startDate, endDate: form.endDate })
          : undefined;
        setProjects((prev) => [
          { id: data.data.id, name: form.name, description: form.description || undefined, myRole: 'CLIENT', milestoneCount: 0, createdAt: new Date().toISOString(), metadata: meta },
          ...prev,
        ]);
        setUserRole('CLIENT');
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to archive project');
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      setToast('Project archived successfully');
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to archive');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <Layout><ProjectsListSkeleton /></Layout>;
  }

  return (
    <Layout>
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 shadow-lg"
          style={{ backgroundColor: 'rgba(92,186,128,0.1)', border: '1px solid rgba(92,186,128,0.3)', color: '#5cba80' }}
        >
          <span className="text-sm font-medium">{toast}</span>
          <button onClick={() => setToast('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header row */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>Projects</h1>
        <div className="flex items-center gap-2">
          {/* Grid / Table toggle */}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--ax-border)' }}>
            <button
              onClick={() => setView('grid')}
              title="Card view"
              className={`p-2 transition-colors ${view === 'grid' ? 'ax-nav-active' : 'ax-nav-item'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('table')}
              title="Table view"
              className={`p-2 transition-colors ${view === 'table' ? 'ax-nav-active' : 'ax-nav-item'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <ClientOnly role={userRole}>
            <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Project
            </button>
          </ClientOnly>
        </div>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      {/* Empty state */}
      {projects.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <p className="text-lg font-semibold mb-2" style={{ color: 'var(--ax-text)' }}>No projects yet</p>
            {userRole === 'CLIENT' ? (
              <>
                <p className="text-sm mb-6" style={{ color: 'rgba(var(--ax-text-rgb), 0.45)' }}>
                  Create your first project to get started.
                </p>
                <button onClick={openCreateModal} className="btn btn-primary">
                  Create your first project
                </button>
              </>
            ) : (
              <p className="text-sm mt-1" style={{ color: 'rgba(var(--ax-text-rgb), 0.45)' }}>
                You haven&apos;t been added to any projects yet. Ask a project owner to invite you.
              </p>
            )}
          </div>
        </div>

      ) : view === 'grid' ? (
        /* ── Card grid ── */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="card hover:shadow-none transition-shadow relative group">
              <Link href={`/projects/${project.id}`} className="card-body block">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--ax-text)' }}>
                      {project.name}
                    </h3>
                    {project.isExampleProject && (
                      <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'var(--ax-accent-subtle)', color: 'var(--ax-accent)' }}>
                        Example
                      </span>
                    )}
                    {project.status === 'COMPLETED' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-[rgba(50,200,120,0.1)] text-[#5cba80]">
                        Completed
                      </span>
                    )}
                    {project.status === 'ONGOING' && (
                      <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'var(--ax-accent-subtle)', color: 'var(--ax-accent)' }}>
                        Ongoing
                      </span>
                    )}
                  </div>
                  <span className="badge badge-draft">{project.myRole}</span>
                </div>
                {project.description && (
                  <p className="text-sm mt-2 line-clamp-2" style={{ color: 'rgba(var(--ax-text-rgb), 0.55)' }}>
                    {project.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.55)' }}>
                  <span>{project.milestoneCount} milestones</span>
                  <span>{formatDate(project.createdAt)}</span>
                </div>
              </Link>

              {project.myRole === 'CLIENT' && (
                <div className="absolute top-3 right-12 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditModal(project); }}
                    className="p-1.5 rounded-md transition-colors ax-hover-overlay"
                    style={{
                      backgroundColor: 'var(--ax-overlay)',
                      border: '1px solid var(--ax-border)',
                      color: 'rgba(var(--ax-text-rgb), 0.55)',
                    }}
                    title="Edit project"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(project); }}
                    className="p-1.5 rounded-md transition-colors hover:bg-[rgba(220,80,60,0.1)] hover:text-[#e06050]"
                    style={{
                      backgroundColor: 'var(--ax-overlay)',
                      border: '1px solid var(--ax-border)',
                      color: 'rgba(var(--ax-text-rgb), 0.55)',
                    }}
                    title="Archive project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

      ) : (
        /* ── Table view ── */
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Role</th>
                <th>Milestones</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium hover:underline transition-colors"
                      style={{ color: 'var(--ax-text)' }}
                    >
                      {project.name}
                    </Link>
                    {project.description && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'rgba(var(--ax-text-rgb), 0.45)' }}>
                        {project.description}
                      </p>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {project.status === 'COMPLETED' ? (
                        <span className="badge badge-verified">Completed</span>
                      ) : project.status === 'ONGOING' ? (
                        <span className="badge badge-in-progress">Ongoing</span>
                      ) : (
                        <span className="badge badge-draft">{project.status || 'Active'}</span>
                      )}
                      {project.isExampleProject && (
                        <span className="badge badge-in-progress">Example</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-draft">{project.myRole}</span>
                  </td>
                  <td style={{ color: 'rgba(var(--ax-text-rgb), 0.7)' }}>
                    {project.milestoneCount}
                  </td>
                  <td style={{ color: 'rgba(var(--ax-text-rgb), 0.55)' }}>
                    {formatDate(project.createdAt)}
                  </td>
                  <td>
                    {project.myRole === 'CLIENT' && (
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => openEditModal(project)}
                          className="p-1.5 rounded-md transition-colors ax-hover-overlay"
                          style={{ color: 'rgba(var(--ax-text-rgb), 0.45)' }}
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(project)}
                          className="p-1.5 rounded-md transition-colors hover:text-[#e06050] ax-hover-overlay"
                          style={{ color: 'rgba(var(--ax-text-rgb), 0.45)' }}
                          title="Archive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !submitting && setShowModal(false)}
        >
          <div
            className="rounded-xl w-full max-w-lg overflow-hidden border"
            style={{ backgroundColor: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--ax-border)' }}
            >
              <h2 className="text-lg font-semibold" style={{ color: 'var(--ax-text)' }}>
                {editingProject ? 'Edit Project' : 'Create Project'}
              </h2>
              <button
                onClick={() => !submitting && setShowModal(false)}
                className="p-1 rounded-lg ax-hover-overlay transition-colors"
                style={{ color: 'rgba(var(--ax-text-rgb), 0.4)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="alert alert-error text-sm">{modalError}</div>
              )}

              <div>
                <label className="label text-xs">Project Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="input text-sm"
                  placeholder="e.g. Downtown Office Building"
                />
              </div>

              <div>
                <label className="label text-xs">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="input text-sm resize-none"
                  placeholder="Brief project description..."
                />
              </div>

              <div>
                <label className="label text-xs">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="input text-sm"
                  placeholder="e.g. Dubai Marina, UAE"
                />
              </div>

              <div>
                <label className="label text-xs">Contract Value (INR)</label>
                <input
                  type="number"
                  value={form.contractValue}
                  onChange={(e) => setForm({ ...form, contractValue: e.target.value })}
                  className="input text-sm"
                  placeholder="e.g. 45000000"
                  min="0"
                  step="1000"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="label text-xs">End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="input text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="btn btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.name.trim()}
                  className="btn btn-primary text-sm"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting
                    ? (editingProject ? 'Saving...' : 'Creating...')
                    : (editingProject ? 'Save Changes' : 'Create Project')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="rounded-xl w-full max-w-md overflow-hidden border"
            style={{ backgroundColor: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--ax-text)' }}>
                Archive Project
              </h2>
              <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.55)' }}>
                Are you sure you want to archive <strong style={{ color: 'var(--ax-text)' }}>{deleteTarget.name}</strong>?
                This action cannot be undone.
              </p>
            </div>
            <div
              className="flex justify-end gap-3 px-6 py-4 border-t"
              style={{ backgroundColor: 'var(--ax-overlay)', borderColor: 'var(--ax-border)' }}
            >
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn btn-danger text-sm"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {deleting ? 'Archiving...' : 'Archive Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
