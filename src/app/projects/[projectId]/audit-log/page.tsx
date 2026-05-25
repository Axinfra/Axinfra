'use client';

import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDateTime } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface AuditLogEntry {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  role: string;
  reason?: string;
  createdAt: string;
  actor: {
    name: string;
    email: string;
  };
  beforeJson?: any;
  afterJson?: any;
}

export default function AuditLogPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const [filters, setFilters] = useState({
    entityType: '',
    actionType: '',
    limit: 25,
    offset: 0,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const auditUrl = useMemo(() => {
    if (!projectId) return null;
    return (
      `/api/projects/${projectId}/audit-log?` +
      new URLSearchParams({
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.actionType && { actionType: filters.actionType }),
        limit: filters.limit.toString(),
        offset: filters.offset.toString(),
      })
    );
  }, [projectId, filters]);

  const { data: payload, isLoading: logsLoading } = useSWR<{
    logs: AuditLogEntry[];
    total: number;
  }>(auditUrl, jsonFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });

  const logs: AuditLogEntry[] = payload?.logs ?? [];
  const total = payload?.total ?? 0;
  const loading = projectLoading || logsLoading;

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/audit-log/export?` +
          new URLSearchParams({
            ...(filters.entityType && { entityType: filters.entityType }),
          })
      );

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${projectId}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        setError(data.error || 'Export failed');
      }
    } catch {
      setError('Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  const entityTypes = ['Milestone', 'BOQ', 'Phase', 'Evidence', 'Project', 'Role', 'FollowUp', 'Payment', 'Cash'];
  const actionTypes = [
    'BOQ_CREATE', 'BOQ_APPROVE', 'BOQ_REVISE', 'BOQ_ITEM_ADD', 'BOQ_ITEM_UPDATE', 'BOQ_ITEM_REMOVE',
    'MILESTONE_CREATE', 'MILESTONE_UPDATE', 'MILESTONE_DELETE', 'MILESTONE_STATE_TRANSITION', 'MILESTONE_BOQ_LINK',
    'EVIDENCE_SUBMIT', 'EVIDENCE_APPROVE', 'EVIDENCE_REJECT',
    'VERIFICATION_CREATE',
    'ELIGIBILITY_RECALCULATED', 'ELIGIBILITY_BLOCKED', 'ELIGIBILITY_UNBLOCKED', 'ELIGIBILITY_MARKED_PAID',
    'ROLE_ASSIGN', 'ROLE_REMOVE',
    'FOLLOWUP_CREATE', 'FOLLOWUP_RESOLVE', 'FOLLOWUP_ESCALATE',
    'PROJECT_CREATE', 'PROJECT_UPDATE',
  ];

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Audit Log</h1>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-secondary"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Filters */}
        <div className="card">
          <div className="card-body">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="label">Entity Type</label>
                <select
                  className="input"
                  value={filters.entityType}
                  onChange={(e) =>
                    setFilters({ ...filters, entityType: e.target.value, offset: 0 })
                  }
                >
                  <option value="">All</option>
                  {entityTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Action Type</label>
                <select
                  className="input"
                  value={filters.actionType}
                  onChange={(e) =>
                    setFilters({ ...filters, actionType: e.target.value, offset: 0 })
                  }
                >
                  <option value="">All</option>
                  {actionTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Logs */}
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <span className="text-sm text-[rgba(232,228,220,0.55)]">
              Showing {logs.length} of {total} entries
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <>
                    <tr key={log.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                      <td className="text-sm">{formatDateTime(log.createdAt)}</td>
                      <td>
                        <div>
                          <p className="font-medium">{log.actor.name}</p>
                          <p className="text-xs text-[rgba(232,228,220,0.55)]">{log.actor.email}</p>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-draft">{log.role}</span>
                      </td>
                      <td className="font-medium">{log.actionType}</td>
                      <td>
                        <span className="text-[rgba(232,228,220,0.55)]">{log.entityType}</span>
                      </td>
                      <td>
                        <button className="text-[#c4a35a] text-sm">
                          {expandedId === log.id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={6} className="bg-[rgba(255,255,255,0.03)]">
                          <div className="p-4 space-y-2">
                            <p className="text-sm">
                              <strong>Entity ID:</strong> {log.entityId}
                            </p>
                            {log.reason && (
                              <p className="text-sm">
                                <strong>Reason:</strong> {log.reason}
                              </p>
                            )}
                            {log.beforeJson && (
                              <div className="text-sm">
                                <strong>Before:</strong>
                                <pre className="mt-1 p-2 bg-[rgba(255,255,255,0.03)] rounded text-xs overflow-auto max-h-32">
                                  {JSON.stringify(log.beforeJson, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.afterJson && (
                              <div className="text-sm">
                                <strong>After:</strong>
                                <pre className="mt-1 p-2 bg-[rgba(255,255,255,0.03)] rounded text-xs overflow-auto max-h-32">
                                  {JSON.stringify(log.afterJson, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {total > filters.limit && (() => {
          const currentPage = Math.floor(filters.offset / filters.limit) + 1;
          const totalPageCount = Math.ceil(total / filters.limit);
          const goTo = (p: number) =>
            setFilters({ ...filters, offset: (p - 1) * filters.limit });
          const pages = Array.from({ length: totalPageCount }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPageCount || Math.abs(p - currentPage) <= 1)
            .reduce<(number | '…')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
              acc.push(p);
              return acc;
            }, []);
          return (
            <div className="flex items-center justify-between py-2">
              <p className="text-sm text-[rgba(232,228,220,0.45)]">
                Showing {filters.offset + 1}–{Math.min(filters.offset + filters.limit, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => goTo(currentPage - 1)}
                  className="btn btn-sm btn-secondary disabled:opacity-40"
                >
                  ← Prev
                </button>
                {pages.map((p, i) =>
                  p === '…' ? (
                    <span key={`e-${i}`} className="px-2 text-[rgba(232,228,220,0.3)] text-sm">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goTo(p as number)}
                      className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  disabled={currentPage === totalPageCount}
                  onClick={() => goTo(currentPage + 1)}
                  className="btn btn-sm btn-secondary disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
