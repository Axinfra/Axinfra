'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import CustomViewBoard from '@/components/CustomViewBoard';
import CreateViewModal from '@/components/CreateViewModal';

interface ViewConfig {
  filters: Record<string, unknown>;
  groupBy?: string;
  sortBy?: string;
  sortOrder?: string;
}

interface CustomView {
  id: string;
  name: string;
  config: ViewConfig;
  isDefault: boolean;
}

interface Template {
  name: string;
  config: ViewConfig;
}

interface GroupedMilestones {
  groupKey: string;
  groupLabel: string;
  milestones: Array<{
    id: string;
    title: string;
    description: string | null;
    state: string;
    paymentModel: string;
    plannedEnd: string | null;
    plannedValue: number;
    completionPercent: number;
    isDelayed: boolean;
    vendor: string | null;
    trade: string | null;
    eligibilityState: string | null;
    paymentValue: number;
  }>;
  totalValue: number;
  count: number;
}

/**
 * Custom Views Page - READ-ONLY milestone projections.
 *
 * CRITICAL SAFETY CONSTRAINTS:
 * - This page is READ-ONLY
 * - NO milestone mutations allowed
 * - NO state transitions
 * - NO drag & drop
 * - Views are visual projections ONLY
 */
export default function CustomViewsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [views, setViews] = useState<CustomView[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupedMilestones[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [projectId]);

  useEffect(() => {
    if (selectedViewId) {
      loadViewData(selectedViewId);
    }
  }, [selectedViewId]);

  const loadInitialData = async () => {
    try {
      const [projectRes, viewsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/views`),
      ]);

      const [projectData, viewsData] = await Promise.all([
        projectRes.json(),
        viewsRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
      }

      if (viewsData.success) {
        setViews(viewsData.data.views);
        setTemplates(viewsData.data.templates);

        // Load default view or first view
        const defaultView = viewsData.data.views.find((v: CustomView) => v.isDefault);
        if (defaultView) {
          setSelectedViewId(defaultView.id);
        } else if (viewsData.data.views.length > 0) {
          setSelectedViewId(viewsData.data.views[0].id);
        }
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadViewData = async (viewId: string) => {
    setViewLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/views/${viewId}`);
      const data = await res.json();

      if (data.success) {
        setGroups(data.data.groups);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to load view data');
    } finally {
      setViewLoading(false);
    }
  };

  const handleCreateView = async (name: string, config: ViewConfig) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config }),
      });

      const data = await res.json();

      if (data.success) {
        setViews([...views, data.data]);
        setSelectedViewId(data.data.id);
        setShowCreateModal(false);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to create view');
    }
  };

  const handleDeleteView = async (viewId: string) => {
    if (!confirm('Are you sure you want to delete this view?')) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/views/${viewId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        const newViews = views.filter(v => v.id !== viewId);
        setViews(newViews);

        if (selectedViewId === viewId) {
          setSelectedViewId(newViews[0]?.id || null);
          setGroups([]);
        }
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to delete view');
    }
  };

  const handlePreviewTemplate = async (template: Template) => {
    setViewLoading(true);
    setSelectedViewId(null);

    try {
      const configParam = encodeURIComponent(JSON.stringify(template.config));
      const res = await fetch(`/api/projects/${projectId}/views/preview?config=${configParam}`);
      const data = await res.json();

      if (data.success) {
        setGroups(data.data.groups);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to preview template');
    } finally {
      setViewLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  const selectedView = views.find(v => v.id === selectedViewId);

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Custom Views</h1>
            <p className="text-sm text-gray-500 mt-1">
              Read-only projections of milestone data
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            + New View
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* View Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex flex-wrap gap-2 pb-3">
            {/* Saved Views */}
            {views.map(view => (
              <div
                key={view.id}
                className={`flex items-center rounded-lg border ${
                  selectedViewId === view.id
                    ? 'bg-primary-50 border-primary-500'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <button
                  onClick={() => setSelectedViewId(view.id)}
                  className="px-4 py-2 text-sm font-medium"
                >
                  {view.name}
                </button>
                <button
                  onClick={() => handleDeleteView(view.id)}
                  className="px-2 py-2 text-gray-400 hover:text-red-500"
                  title="Delete view"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Separator */}
            {views.length > 0 && templates.length > 0 && (
              <div className="border-l border-gray-300 mx-2" />
            )}

            {/* Template Quick Access */}
            {templates.slice(0, 3).map((template, i) => (
              <button
                key={i}
                onClick={() => handlePreviewTemplate(template)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>

        {/* View Content */}
        {viewLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading view...</p>
          </div>
        ) : groups.length === 0 && views.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <svg
                className="w-12 h-12 text-gray-300 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Custom Views Yet</h3>
              <p className="text-gray-500 mb-4">
                Create custom views to visualize milestones in different ways.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
              >
                Create Your First View
              </button>
            </div>
          </div>
        ) : (
          <CustomViewBoard
            groups={groups}
            projectId={projectId}
            viewName={selectedView?.name}
          />
        )}
      </div>

      {/* Create View Modal */}
      <CreateViewModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateView}
        templates={templates}
      />
    </Layout>
  );
}
