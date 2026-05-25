'use client';

import { ProjectsListSkeleton } from '@/components/ui/SkeletonPage';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import OwnerOnly from '@/components/auth/OwnerOnly';
import { formatDate } from '@/lib/utils';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';

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
          // Get the user's highest role across projects
          const roles = data.data.map((p: Project) => p.myRole);
          if (roles.includes('OWNER')) setUserRole('OWNER');
          else if (roles.includes('PMC')) setUserRole('PMC');
          else if (roles.includes('VENDOR')) setUserRole('VENDOR');
          else if (roles.includes('VIEWER')) setUserRole('VIEWER');
        } else {
          setError(data.error);
        }
      })
      .catch(() => setError('Failed to load projects'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Toast auto-dismiss
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

      const url = editingProject
        ? `/api/projects/${editingProject.id}`
        : '/api/projects';
      const method = editingProject ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save project');
      }

      setShowModal(false);
      setToast(editingProject ? 'Project updated successfully' : 'Project created successfully');

      if (editingProject) {
        // Optimistic update: patch the edited project in-place
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
        // Optimistic update: prepend new project immediately — no refetch needed
        const meta = (form.location || form.contractValue || form.startDate || form.endDate)
          ? JSON.stringify({ location: form.location, contractValue: form.contractValue ? parseFloat(form.contractValue) : undefined, startDate: form.startDate, endDate: form.endDate })
          : undefined;
        setProjects((prev) => [
          {
            id: data.data.id,
            name: form.name,
            description: form.description || undefined,
            myRole: 'OWNER',
            milestoneCount: 0,
            createdAt: new Date().toISOString(),
            metadata: meta,
          },
          ...prev,
        ]);
        setUserRole('OWNER');
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

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to archive project');
      }

      // Optimistic update: remove archived project immediately
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
    return (
      <Layout>
        <ProjectsListSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[rgba(50,200,120,0.1)] border border-[rgba(92,186,128,0.3)] text-[#5cba80] px-4 py-3 rounded-lg shadow-none flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span className="text-sm font-medium">{toast}</span>
          <button onClick={() => setToast('')} className="text-[#5cba80] hover:text-[#5cba80]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#e8e4dc]">Projects</h1>
        <OwnerOnly role={userRole}>
          <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </OwnerOnly>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      {projects.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <p className="text-[rgba(232,228,220,0.55)]">No projects yet</p>
            <OwnerOnly role={userRole}>
              <button onClick={openCreateModal} className="btn btn-primary mt-4">
                Create your first project
              </button>
            </OwnerOnly>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="card hover:shadow-none transition-shadow relative group"
            >
              <Link href={`/projects/${project.id}`} className="card-body block">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-[#e8e4dc]">
                      {project.name}
                    </h3>
                    {project.isExampleProject && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-[rgba(196,163,90,0.08)] text-[#c4a35a]">
                        Example
                      </span>
                    )}
                    {project.status === 'COMPLETED' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-[rgba(50,200,120,0.1)] text-[#5cba80]">
                        Completed
                      </span>
                    )}
                    {project.status === 'ONGOING' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-[rgba(196,163,90,0.08)] text-[#c4a35a]">
                        Ongoing
                      </span>
                    )}
                  </div>
                  <span className="badge badge-draft">{project.myRole}</span>
                </div>
                {project.description && (
                  <p className="text-sm text-[rgba(232,228,220,0.55)] mt-2 line-clamp-2">{project.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between text-sm text-[rgba(232,228,220,0.55)]">
                  <span>{project.milestoneCount} milestones</span>
                  <span>{formatDate(project.createdAt)}</span>
                </div>
              </Link>
              {/* Owner-only action buttons */}
              {project.myRole === 'OWNER' && (
                <div className="absolute top-3 right-12 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditModal(project); }}
                    className="p-1.5 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)] hover:text-[#c4a35a] shadow-none"
                    title="Edit project"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(project); }}
                    className="p-1.5 rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] hover:bg-[rgba(220,80,60,0.1)] text-[rgba(232,228,220,0.55)] hover:text-[#e06050] shadow-none"
                    title="Archive project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => !submitting && setShowModal(false)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.07)]">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">
                {editingProject ? 'Edit Project' : 'Create Project'}
              </h2>
              <button onClick={() => !submitting && setShowModal(false)} className="text-[rgba(232,228,220,0.35)] hover:text-[rgba(232,228,220,0.55)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-[rgba(220,80,60,0.1)] border border-[rgba(224,96,80,0.3)] text-[#e06050] text-sm rounded-lg">
                  {modalError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Project Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
                  placeholder="e.g. Downtown Office Building"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
                  placeholder="Brief project description..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
                  placeholder="e.g. Dubai Marina, UAE"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Contract Value (AED)</label>
                <input
                  type="number"
                  value={form.contractValue}
                  onChange={(e) => setForm({ ...form, contractValue: e.target.value })}
                  className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
                  placeholder="e.g. 45000000"
                  min="0"
                  step="1000"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#e8e4dc] mb-1">End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-sm text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.name.trim()}
                  className="px-4 py-2 text-sm bg-[#c4a35a] text-[#0a0c10] rounded-lg hover:bg-[#b3943f] disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting
                    ? (editingProject ? 'Saving...' : 'Creating...')
                    : (editingProject ? 'Save Changes' : 'Create Project')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5">
              <h2 className="text-lg font-semibold text-[#e8e4dc] mb-2">Archive Project</h2>
              <p className="text-sm text-[rgba(232,228,220,0.55)]">
                Are you sure you want to archive <strong>{deleteTarget.name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 bg-[rgba(255,255,255,0.03)] border-t border-[rgba(255,255,255,0.07)]">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-[#e06050] text-white rounded-lg hover:bg-[#c8503f] disabled:opacity-50 flex items-center gap-2"
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
