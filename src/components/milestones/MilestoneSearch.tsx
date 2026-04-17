'use client';

import { useState, useCallback } from 'react';
import { Search, X, Filter, ChevronLeft, ChevronRight, FileText, AlertCircle, SearchX } from 'lucide-react';
import { useMilestoneSearch, type MilestoneSearchFilters, type SearchMilestone } from '@/hooks/useMilestoneSearch';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface MilestoneSearchProps {
  projectId: string;
  onSearchActive?: (active: boolean) => void;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'SUBMITTED', label: 'In Review' },
  { value: 'VERIFIED', label: 'Approved' },
  { value: 'CLOSED', label: 'Closed' },
];

function getStatusBadge(status: string) {
  switch (status) {
    case 'VERIFIED':
    case 'CLOSED':
      return <Badge variant="success">{status === 'VERIFIED' ? 'Approved' : 'Closed'}</Badge>;
    case 'DRAFT':
      return <Badge variant="neutral">Pending</Badge>;
    case 'SUBMITTED':
      return <Badge variant="default">In Review</Badge>;
    case 'IN_PROGRESS':
      return <Badge variant="warning">In Progress</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MilestoneSearch({ projectId, onSearchActive }: MilestoneSearchProps) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filters: MilestoneSearchFilters = {
    q, status, vendorId: '', vendorName, dateFrom, dateTo, projectId, page: 1,
  };

  const { results, isLoading, error, total, page, totalPages, setPage } = useMilestoneSearch(filters);

  const isActive = !!(q || status || vendorName || dateFrom || dateTo);

  // Notify parent when search is active
  const prevActive = useState(false);
  if (isActive !== prevActive[0]) {
    prevActive[1](isActive);
    onSearchActive?.(isActive);
  }

  const clearAll = useCallback(() => {
    setQ('');
    setStatus('');
    setVendorName('');
    setDateFrom('');
    setDateTo('');
    setShowFilters(false);
    onSearchActive?.(false);
  }, [onSearchActive]);

  const applyFilters = useCallback(() => {
    setPage(1);
  }, [setPage]);

  const resetFilters = useCallback(() => {
    setStatus('');
    setVendorName('');
    setDateFrom('');
    setDateTo('');
  }, []);

  return (
    <div className="mb-6">
      {/* Search bar */}
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(232,228,220,0.35)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search milestones by name, status, vendor..."
            className="w-full pl-10 pr-10 py-2.5 text-sm border border-[rgba(255,255,255,0.07)] rounded-lg bg-[rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)] focus:border-transparent"
          />
          {isActive && (
            <button
              onClick={clearAll}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,228,220,0.35)] hover:text-[rgba(232,228,220,0.55)]"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-lg border transition-colors ${
            showFilters ? 'bg-[rgba(196,163,90,0.08)] border-primary-200 text-[#c4a35a]' : 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[rgba(232,228,220,0.55)] hover:bg-[rgba(255,255,255,0.05)]'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mt-3 p-4 bg-[rgba(255,255,255,0.03)] rounded-lg border border-[rgba(255,255,255,0.07)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-[rgba(232,228,220,0.55)] mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[rgba(232,228,220,0.55)] mb-1">Vendor Name</label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="Search vendor..."
                className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[rgba(232,228,220,0.55)] mb-1">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[rgba(232,228,220,0.55)] mb-1">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full py-2 px-3 text-sm bg-[#1a1c22] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] border border-[rgba(255,255,255,0.07)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 text-sm text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors"
            >
              Reset
            </button>
            <button
              onClick={applyFilters}
              className="px-4 py-1.5 text-sm bg-[#c4a35a] text-[#0a0c10] rounded-lg hover:bg-[#b3943f] transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {isActive && (
        <div className="mt-4">
          {/* Loading state */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 bg-[rgba(255,255,255,0.03)] rounded-lg border border-[rgba(255,255,255,0.07)]">
                  <Skeleton className="h-5 w-2/3 mb-3" />
                  <div className="flex gap-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-10 h-10 text-danger-500 mb-3" />
              <p className="text-sm text-[rgba(232,228,220,0.55)] mb-3">Search failed. Please try again.</p>
              <button
                onClick={() => setPage(page)}
                className="px-4 py-2 text-sm bg-[#c4a35a] text-[#0a0c10] rounded-lg hover:bg-[#b3943f]"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchX className="w-10 h-10 text-surface-300 mb-3" />
              <p className="text-sm text-[rgba(232,228,220,0.55)]">No milestones match your search. Try different filters.</p>
            </div>
          )}

          {/* Results list */}
          {!isLoading && !error && results.length > 0 && (
            <>
              <div className="space-y-3">
                {results.map((milestone: SearchMilestone) => (
                  <div
                    key={milestone.id}
                    className="p-4 bg-[rgba(255,255,255,0.03)] rounded-lg border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.1)] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-[#e8e4dc] truncate">{milestone.title}</h3>
                          {getStatusBadge(milestone.status)}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[rgba(232,228,220,0.55)] mt-1">
                          <span>Due: {formatDate(milestone.dueDate)}</span>
                          {milestone.assignedVendor && (
                            <span>Vendor: {milestone.assignedVendor.name}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {milestone._count.evidence} evidence
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium text-[#e8e4dc]">
                          {formatCurrency(milestone.contractValue)}
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[rgba(232,228,220,0.55)]">{milestone.completionPercentage}% complete</span>
                      </div>
                      <div className="w-full bg-[rgba(255,255,255,0.05)] rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            milestone.completionPercentage === 100 ? 'bg-[#5cba80]'
                            : milestone.completionPercentage >= 50 ? 'bg-[#c4a35a]'
                            : 'bg-[rgba(232,228,220,0.35)]'
                          }`}
                          style={{ width: `${milestone.completionPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-[rgba(255,255,255,0.07)]">
                <span className="text-xs text-[rgba(232,228,220,0.55)]">
                  Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total} results
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
