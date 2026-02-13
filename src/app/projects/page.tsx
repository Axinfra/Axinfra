'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { formatDate } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  description?: string;
  status?: string;
  isExampleProject?: boolean;
  myRole: string;
  milestoneCount: number;
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProjects(data.data);
        } else {
          setError(data.error);
        }
      })
      .catch(() => setError('Failed to load projects'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <Link href="/projects/new" className="btn btn-primary">
          New Project
        </Link>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      {projects.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <p className="text-gray-500">No projects yet</p>
            <Link href="/projects/new" className="btn btn-primary mt-4">
              Create your first project
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="card hover:shadow-md transition-shadow"
            >
              <div className="card-body">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {project.name}
                    </h3>
                    {project.isExampleProject && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                        Example Project
                      </span>
                    )}
                    {project.status === 'COMPLETED' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                        Completed
                      </span>
                    )}
                    {project.status === 'ONGOING' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                        Ongoing
                      </span>
                    )}
                  </div>
                  <span className="badge badge-draft">{project.myRole}</span>
                </div>
                {project.description && (
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                    {project.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                  <span>{project.milestoneCount} milestones</span>
                  <span>{formatDate(project.createdAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
