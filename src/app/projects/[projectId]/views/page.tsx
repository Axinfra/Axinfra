'use client';

import { ListPageSkeleton } from '@/components/ui/SkeletonPage';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import CustomViewBoard from '@/components/CustomViewBoard';
import CreateViewModal from '@/components/CreateViewModal';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

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

  const [error, setError] = useState('');
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupedMilestones[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDeleteViewId, setConfirmDeleteViewId] = useState<string | null>(null);

  // Project metadata via shared context (one fetch per workspace).
  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  // Views list — stable data, 60s dedupe.
  const viewsKey = projectId ? `/api/projects/${projectId}/views` : null;
  const {
    data: viewsPayload,
    isLoading: viewsLoading,
    mutate: refetchViews,
  } = useSWR<{ views: CustomView[]; templates: Template[] }>(viewsKey, jsonFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });

  const views: CustomView[] = viewsPayload?.views ?? [];
  const templates: Template[] = viewsPayload?.templates ?? [];
  const loading = projectLoading || viewsLoading;

  // Pick default selection on first load of views payload.
  useEffect(() => {
    if (selectedViewId || views.length === 0) return;
    const defaultView = views.find((v) => v.isDefault);
    setSelectedViewId(defaultView ? defaultView.id : views[0].id);
  }, [views, selectedViewId]);

  // Load grouped milestones whenever the selected view changes.
  useEffect(() => {
    if (!selectedViewId) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    setViewLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/views/${selectedViewId}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.success) setGroups(data.data.groups);
        else setError(data.error);
      } catch {
        if (!cancelled) setError('Failed to load view data');
      } finally {
        if (!cancelled) setViewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedViewId, projectId]);

  const handleCreateView = async (name: string, config: ViewConfig) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config }),
      });

      const data = await res.json();

      if (data.success) {
        await refetchViews();
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
    setConfirmDeleteViewId(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/views/${viewId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        const remaining = views.filter((v) => v.id !== viewId);
        await refetchViews();
        if (selectedViewId === viewId) {
          setSelectedViewId(remaining[0]?.id || null);
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
        <ListPageSkeleton />
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
            <h1 className="text-2xl font-bold text-[#e8e4dc]">Custom Views</h1>
            <p className="text-sm text-[rgba(232,228,220,0.55)] mt-1">
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
        <div className="border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex flex-wrap gap-2 pb-3">
            {/* Saved Views */}
            {views.map(view => (
              <div
                key={view.id}
                className={`flex items-center rounded-lg border ${
                  selectedViewId === view.id
                    ? 'bg-[rgba(196,163,90,0.08)] border-[#c4a35a]'
                    : 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.1)]'
                }`}
              >
                <button
                  onClick={() => setSelectedViewId(view.id)}
                  className="px-4 py-2 text-sm font-medium"
                >
                  {view.name}
                </button>
                <button
                  onClick={() => setConfirmDeleteViewId(view.id)}
                  className="px-2 py-2 text-[rgba(232,228,220,0.35)] hover:text-red-500"
                  title="Delete view"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Separator */}
            {views.length > 0 && templates.length > 0 && (
              <div className="border-l border-[rgba(255,255,255,0.1)] mx-2" />
            )}

            {/* Template Quick Access */}
            {templates.slice(0, 3).map((template, i) => (
              <button
                key={i}
                onClick={() => handlePreviewTemplate(template)}
                className="px-4 py-2 text-sm text-[rgba(232,228,220,0.55)] bg-[rgba(255,255,255,0.05)] rounded-lg hover:bg-[rgba(255,255,255,0.06)]"
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
            <p className="mt-2 text-[rgba(232,228,220,0.55)]">Loading view...</p>
          </div>
        ) : groups.length === 0 && views.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <svg
                className="w-12 h-12 text-[rgba(232,228,220,0.35)] mx-auto mb-4"
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
              <h3 className="text-lg font-medium text-[#e8e4dc] mb-2">No Custom Views Yet</h3>
              <p className="text-[rgba(232,228,220,0.55)] mb-4">
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

      {/* Delete View confirmation modal */}
      {confirmDeleteViewId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e06050]">Delete View</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4 text-sm">
                Are you sure you want to delete this view? This cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDeleteViewId(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDeleteView(confirmDeleteViewId)}
                  className="btn bg-[#e06050] text-white hover:bg-[#c8503f]"
                >
                  Delete View
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
