'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });

      const data = await res.json();

      if (data.success) {
        router.push(`/projects/${data.data.id}`);
      } else {
        setError(data.error || 'Failed to create project');
      }
    } catch {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Page header */}
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
          <h1 className="text-2xl font-bold text-[#e8e4dc] mt-3">Create New Project</h1>
          <p className="text-[rgba(232,228,220,0.55)] mt-1">
            Set up a new project to manage milestones, BOQs, and payments.
          </p>
        </div>

        {error && <div className="alert alert-error mb-6">{error}</div>}

        <form onSubmit={handleSubmit}>
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
              disabled={loading}
              className="btn btn-primary disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
