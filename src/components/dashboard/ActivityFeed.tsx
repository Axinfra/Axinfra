'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';
import { Activity, Loader2 } from 'lucide-react';

interface ActivityItem {
  id: string;
  actor: string;
  role: string;
  sentence: string;
  createdAt: string;
}

interface ActivityFeedPayload {
  items: ActivityItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

const ROLE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  CLIENT: { bg: 'rgba(255,255,255,0.10)', color: '#ffffff', label: 'Client' },
  PMC: { bg: 'rgba(74,144,217,0.18)', color: '#4A90D9', label: 'PMC' },
  VENDOR: { bg: 'rgba(245,166,35,0.18)', color: '#F5A623', label: 'Vendor' },
  VIEWER: { bg: 'rgba(232,228,220,0.10)', color: 'rgba(var(--ax-text-rgb),0.55)', label: 'Viewer' },
  SYSTEM: { bg: 'rgba(232,228,220,0.06)', color: 'rgba(var(--ax-text-rgb),0.45)', label: 'System' },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Just now';
  const secs = Math.floor(ms / 1000);
  if (secs < 30) return 'Just now';
  if (secs < 60) return `${secs} seconds ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) {
    const d = new Date(iso);
    return `Yesterday at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ActivityFeed({ projectId }: { projectId: string }) {
  const [pages, setPages] = useState(1);

  // SWR key encodes projectId + how many pages of items to fetch in one go.
  // Refresh every 30s for an auto-updating feed.
  const { data, error, isLoading, mutate } = useSWR<ActivityFeedPayload>(
    projectId
      ? `/api/dashboard/activity-feed?projectId=${projectId}&page=0&pageSize=${pages * PAGE_SIZE}`
      : null,
    jsonFetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const items = data?.items ?? [];
  const hasMore = data?.hasMore ?? false;

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--ax-accent)]" />
          <h2 className="text-base font-semibold text-[#f5f1e8]">Recent Activity</h2>
        </div>
        <button
          onClick={() => mutate()}
          className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[rgba(232,228,220,0.85)] transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="card-body p-0">
        {isLoading && !data ? (
          <ActivityFeedSkeleton />
        ) : error ? (
          <p className="px-6 py-8 text-sm text-red-300">Failed to load activity.</p>
        ) : items.length === 0 ? (
          <p className="px-6 py-8 text-sm text-[rgba(232,228,220,0.55)]">
            No recent activity yet.
          </p>
        ) : (
          <ul className="divide-y divide-[rgba(255,255,255,0.05)]">
            {items.map((item) => {
              const style = ROLE_STYLE[item.role] || ROLE_STYLE.SYSTEM;
              return (
                <li
                  key={item.id}
                  className="px-6 py-3.5 flex items-start gap-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                >
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0 mt-0.5"
                    style={{ backgroundColor: style.bg, color: style.color }}
                  >
                    {style.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[rgba(232,228,220,0.9)] leading-relaxed">
                      {item.sentence}
                      <span className="text-[rgba(232,228,220,0.45)]"> · {relativeTime(item.createdAt)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && !isLoading && (
          <div className="px-6 py-3 border-t border-[rgba(255,255,255,0.05)]">
            <button
              onClick={() => setPages((p) => p + 1)}
              className="text-sm text-[var(--ax-accent)] hover:text-[#d4b46a] transition-colors flex items-center gap-1.5"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityFeedSkeleton() {
  return (
    <div className="px-6 py-8 flex items-center gap-2 text-sm text-[rgba(232,228,220,0.45)]">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading activity...
    </div>
  );
}
