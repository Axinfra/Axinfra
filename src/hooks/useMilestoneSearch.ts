'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface MilestoneSearchFilters {
  q: string;
  status: string;
  vendorId: string;
  vendorName: string;
  dateFrom: string;
  dateTo: string;
  projectId: string;
  page: number;
}

export interface SearchMilestone {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completionPercentage: number;
  contractValue: number;
  assignedVendor: { id: string; name: string; email: string } | null;
  project: { id: string; name: string };
  _count: { evidence: number };
}

export interface UseMilestoneSearchResult {
  results: SearchMilestone[];
  isLoading: boolean;
  error: string | null;
  total: number;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
}

function hasActiveFilters(filters: MilestoneSearchFilters): boolean {
  return !!(filters.q || filters.status || filters.vendorId || filters.vendorName || filters.dateFrom || filters.dateTo);
}

export function useMilestoneSearch(filters: MilestoneSearchFilters): UseMilestoneSearchResult {
  const [results, setResults] = useState<SearchMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(filters.page);
  const [totalPages, setTotalPages] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(async (currentFilters: MilestoneSearchFilters, currentPage: number) => {
    if (!currentFilters.projectId) return;
    if (!hasActiveFilters(currentFilters)) {
      setResults([]);
      setTotal(0);
      setTotalPages(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('projectId', currentFilters.projectId);
      params.set('page', String(currentPage));
      params.set('limit', '20');

      if (currentFilters.q) params.set('q', currentFilters.q);
      if (currentFilters.status) params.set('status', currentFilters.status);
      if (currentFilters.vendorId) params.set('vendorId', currentFilters.vendorId);
      if (currentFilters.vendorName) params.set('vendorName', currentFilters.vendorName);
      if (currentFilters.dateFrom) params.set('dateFrom', currentFilters.dateFrom);
      if (currentFilters.dateTo) params.set('dateTo', currentFilters.dateTo);

      const res = await fetch(`/api/milestones/search?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Search failed');
      }

      setResults(json.data.milestones);
      setTotal(json.data.total);
      setTotalPages(json.data.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounce text search, immediate for other filters
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const delay = filters.q ? 400 : 0;
    debounceRef.current = setTimeout(() => {
      fetchResults(filters, page);
    }, delay);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filters.q, filters.status, filters.vendorId, filters.vendorName, filters.dateFrom, filters.dateTo, filters.projectId, page, fetchResults]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters.q, filters.status, filters.vendorId, filters.vendorName, filters.dateFrom, filters.dateTo]);

  return { results, isLoading, error, total, page, totalPages, setPage };
}
