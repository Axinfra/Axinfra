'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDateTime } from '@/lib/utils';

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
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const [filters, setFilters] = useState({
    entityType: '',
    actionType: '',
    limit: 50,
    offset: 0,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [projectId, filters]);

  const loadData = async () => {
    try {
      const [projectRes, logsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(
          `/api/projects/${projectId}/audit-log?` +
            new URLSearchParams({
              ...(filters.entityType && { entityType: filters.entityType }),
              ...(filters.actionType && { actionType: filters.actionType }),
              limit: filters.limit.toString(),
              offset: filters.offset.toString(),
            })
        ),
      ]);

      const [projectData, logsData] = await Promise.all([
        projectRes.json(),
        logsRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
      }

      if (logsData.success) {
        setLogs(logsData.data.logs);
        setTotal(logsData.data.total);
      }
    } catch {
      setError('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

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
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  const entityTypes = Array.from(new Set(logs.map((l) => l.entityType)));
  const actionTypes = Array.from(new Set(logs.map((l) => l.actionType)));

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
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
            <span className="text-sm text-gray-500">
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
                          <p className="text-xs text-gray-500">{log.actor.email}</p>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-draft">{log.role}</span>
                      </td>
                      <td className="font-medium">{log.actionType}</td>
                      <td>
                        <span className="text-gray-600">{log.entityType}</span>
                      </td>
                      <td>
                        <button className="text-primary-600 text-sm">
                          {expandedId === log.id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={6} className="bg-gray-50">
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
                                <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-32">
                                  {JSON.stringify(log.beforeJson, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.afterJson && (
                              <div className="text-sm">
                                <strong>After:</strong>
                                <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-32">
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
        {total > filters.limit && (
          <div className="flex justify-center space-x-2">
            <button
              disabled={filters.offset === 0}
              onClick={() => setFilters({ ...filters, offset: Math.max(0, filters.offset - filters.limit) })}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </button>
            <span className="py-2 px-4 text-sm text-gray-600">
              Page {Math.floor(filters.offset / filters.limit) + 1} of{' '}
              {Math.ceil(total / filters.limit)}
            </span>
            <button
              disabled={filters.offset + filters.limit >= total}
              onClick={() => setFilters({ ...filters, offset: filters.offset + filters.limit })}
              className="btn btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
