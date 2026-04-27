'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { PrivateCostCategoryLabels, CashSummary } from '@/types';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface CashAdjustment {
  id: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  reason: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; email: string };
}

interface PrivateCost {
  id: string;
  description: string;
  amount: number;
  category: string;
  vendor: string | null;
  notes: string | null;
  incurredAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; email: string };
}

type TabKey = 'adjustments' | 'costs';

// ─── Page Component ─────────────────────────────────────────────────────────

export default function CashModulePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  // Project info via shared context
  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('adjustments');

  // SWR keys — only fire when projectId is set.
  // Cash routes return 403 for non-OWNER; we treat that as "no access" via err.
  const cashKey = projectId ? `/api/projects/${projectId}/cash` : null;
  const costsKey = projectId ? `/api/projects/${projectId}/cash/costs` : null;

  const {
    data: cashData,
    error: cashErr,
    isLoading: cashLoading,
    mutate: refetchCash,
  } = useSWR<{
    adjustments: CashAdjustment[];
    total: number;
    summary: CashSummary;
  }>(cashKey, jsonFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });

  const {
    data: costsData,
    isLoading: costsLoading,
    mutate: refetchCosts,
  } = useSWR<{ costs: PrivateCost[]; total: number }>(
    costsKey,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const adjustments: CashAdjustment[] = cashData?.adjustments ?? [];
  const adjustmentsTotal = cashData?.total ?? 0;
  const costs: PrivateCost[] = costsData?.costs ?? [];
  const costsTotal = costsData?.total ?? 0;
  const summary: CashSummary | null = cashData?.summary ?? null;

  // 403 from cash → access denied (only OWNER can hit /cash)
  const accessDenied = cashErr?.message?.includes('HTTP 403') ?? false;
  const loading = projectLoading || cashLoading || costsLoading;

  // UI state
  const [error, setError] = useState('');
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Adjustment form
  const [adjDescription, setAdjDescription] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjType, setAdjType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjReason, setAdjReason] = useState('');

  // Cost form
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCategory, setCostCategory] = useState('LABOR');
  const [costVendor, setCostVendor] = useState('');
  const [costNotes, setCostNotes] = useState('');
  const [costIncurredAt, setCostIncurredAt] = useState('');

  // ─── Create Handlers ───────────────────────────────────────────────────

  const handleCreateAdjustment = async () => {
    if (!adjDescription.trim() || !adjAmount) {
      setError('Description and amount are required');
      return;
    }

    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Amount must be a positive number');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/cash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: adjDescription.trim(),
          amount,
          type: adjType,
          reason: adjReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Reset form
        setAdjDescription('');
        setAdjAmount('');
        setAdjType('CREDIT');
        setAdjReason('');
        setShowAdjustmentForm(false);
        // Reload data
        await refetchCash();
      } else {
        setError(data.error || 'Failed to create adjustment');
      }
    } catch {
      setError('Failed to create adjustment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCost = async () => {
    if (!costDescription.trim() || !costAmount) {
      setError('Description and amount are required');
      return;
    }

    const amount = parseFloat(costAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Amount must be a positive number');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/cash/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: costDescription.trim(),
          amount,
          category: costCategory,
          vendor: costVendor.trim() || undefined,
          notes: costNotes.trim() || undefined,
          incurredAt: costIncurredAt || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Reset form
        setCostDescription('');
        setCostAmount('');
        setCostCategory('LABOR');
        setCostVendor('');
        setCostNotes('');
        setCostIncurredAt('');
        setShowCostForm(false);
        // Reload data
        await Promise.all([refetchCosts(), refetchCash()]);
      } else {
        setError(data.error || 'Failed to create cost entry');
      }
    } catch {
      setError('Failed to create cost entry');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12 text-[rgba(232,228,220,0.55)]">Loading Cash Module...</div>
      </Layout>
    );
  }

  if (accessDenied) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-danger-50 mb-4">
            <svg className="w-8 h-8 text-danger-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#e8e4dc] mb-2">Access Denied</h2>
          <p className="text-sm text-[rgba(232,228,220,0.55)] mb-6">The Cash Module is restricted to the Builder role.</p>
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="px-4 py-2 bg-[#c4a35a] text-white text-sm font-medium rounded-lg hover:bg-[#b3943f] transition-colors"
          >
            Back to Project
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#e8e4dc]">Builder Cash Module</h1>
            <p className="text-sm text-[rgba(232,228,220,0.55)] mt-1">Private financial tracking — visible only to you</p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700">
            {error}
            <button onClick={() => setError('')} className="ml-3 font-medium underline">Dismiss</button>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="bg-[rgba(255,255,255,0.03)] rounded-xl border border-[rgba(255,255,255,0.07)] p-5">
              <p className="text-xs font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider">Total Credits</p>
              <p className="text-2xl font-bold text-[#5cba80] mt-1">{formatCurrency(summary.totalCredits)}</p>
              <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1">{summary.adjustmentCount} adjustments</p>
            </div>
            <div className="bg-[rgba(255,255,255,0.03)] rounded-xl border border-[rgba(255,255,255,0.07)] p-5">
              <p className="text-xs font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider">Total Debits</p>
              <p className="text-2xl font-bold text-[#e06050] mt-1">{formatCurrency(summary.totalDebits)}</p>
            </div>
            <div className="bg-[rgba(255,255,255,0.03)] rounded-xl border border-[rgba(255,255,255,0.07)] p-5">
              <p className="text-xs font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider">Net Cash Position</p>
              <p className={`text-2xl font-bold mt-1 ${summary.netCashPosition >= 0 ? 'text-[#5cba80]' : 'text-[#e06050]'}`}>
                {formatCurrency(summary.netCashPosition)}
              </p>
            </div>
            <div className="bg-[rgba(255,255,255,0.03)] rounded-xl border border-[rgba(255,255,255,0.07)] p-5">
              <p className="text-xs font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider">Private Costs</p>
              <p className="text-2xl font-bold text-[#e8e4dc] mt-1">{formatCurrency(summary.totalPrivateCosts)}</p>
              <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1">{summary.costEntryCount} entries</p>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('adjustments')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-all duration-200 rounded-t-md ${
                activeTab === 'adjustments'
                  ? 'border-primary-600 text-[#c4a35a] bg-[rgba(196,163,90,0.08)]/50'
                  : 'border-transparent text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] hover:border-[rgba(255,255,255,0.1)]'
              }`}
            >
              Cash Adjustments
              <span className="ml-2 text-xs bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)] rounded-full px-2 py-0.5">
                {adjustmentsTotal}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('costs')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-all duration-200 rounded-t-md ${
                activeTab === 'costs'
                  ? 'border-primary-600 text-[#c4a35a] bg-[rgba(196,163,90,0.08)]/50'
                  : 'border-transparent text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] hover:border-[rgba(255,255,255,0.1)]'
              }`}
            >
              Private Cost Entries
              <span className="ml-2 text-xs bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)] rounded-full px-2 py-0.5">
                {costsTotal}
              </span>
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: Cash Adjustments
            ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'adjustments' && (
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowAdjustmentForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#c4a35a] text-white text-sm font-medium rounded-lg hover:bg-[#b3943f] transition-colors"
              >
                <PlusIcon />
                New Adjustment
              </button>
            </div>

            {/* Adjustment Table */}
            <div className="bg-[rgba(255,255,255,0.03)] rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.07)]">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Created By</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {adjustments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-[rgba(232,228,220,0.35)]">
                          No cash adjustments yet. Click &quot;New Adjustment&quot; to add one.
                        </td>
                      </tr>
                    ) : (
                      adjustments.map((adj) => (
                        <tr key={adj.id} className="hover:bg-[rgba(255,255,255,0.05)]/50 transition-colors">
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                adj.type === 'CREDIT'
                                  ? 'bg-[rgba(50,200,120,0.1)] text-[#5cba80] border border-green-200'
                                  : 'bg-[rgba(220,80,60,0.1)] text-[#e06050] border border-[rgba(224,96,80,0.3)]'
                              }`}
                            >
                              {adj.type === 'CREDIT' ? '+ Credit' : '- Debit'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-[#e8e4dc]">{adj.description}</td>
                          <td className={`px-4 py-3 text-sm font-semibold text-right ${adj.type === 'CREDIT' ? 'text-[#5cba80]' : 'text-[#e06050]'}`}>
                            {adj.type === 'CREDIT' ? '+' : '-'}{formatCurrency(adj.amount)}
                          </td>
                          <td className="px-4 py-3 text-sm text-[rgba(232,228,220,0.55)]">{adj.reason || '-'}</td>
                          <td className="px-4 py-3 text-sm text-[rgba(232,228,220,0.55)]">{adj.createdBy.name}</td>
                          <td className="px-4 py-3 text-sm text-[rgba(232,228,220,0.35)]">{formatDateTime(adj.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: Private Cost Entries
            ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'costs' && (
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex justify-between items-center">
              {/* Category breakdown (mini) */}
              {summary && Object.keys(summary.costsByCategory).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(summary.costsByCategory).map(([cat, total]) => (
                    <span key={cat} className="inline-flex items-center gap-1.5 px-3 py-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-full text-xs text-[rgba(232,228,220,0.55)]">
                      <span className="font-medium">{PrivateCostCategoryLabels[cat as keyof typeof PrivateCostCategoryLabels] || cat}</span>
                      <span className="text-[rgba(232,228,220,0.35)]">{formatCurrency(total)}</span>
                    </span>
                  ))}
                </div>
              )}
              {(!summary || Object.keys(summary.costsByCategory).length === 0) && <div />}
              <button
                onClick={() => setShowCostForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#c4a35a] text-white text-sm font-medium rounded-lg hover:bg-[#b3943f] transition-colors shrink-0"
              >
                <PlusIcon />
                New Cost Entry
              </button>
            </div>

            {/* Costs Table */}
            <div className="bg-[rgba(255,255,255,0.03)] rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.07)]">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Incurred</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {costs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-[rgba(232,228,220,0.35)]">
                          No private cost entries yet. Click &quot;New Cost Entry&quot; to add one.
                        </td>
                      </tr>
                    ) : (
                      costs.map((cost) => (
                        <tr key={cost.id} className="hover:bg-[rgba(255,255,255,0.05)]/50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2.5 py-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-full text-xs font-medium text-[#e8e4dc]">
                              {PrivateCostCategoryLabels[cost.category as keyof typeof PrivateCostCategoryLabels] || cost.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-[#e8e4dc]">{cost.description}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-right text-[#e8e4dc]">{formatCurrency(cost.amount)}</td>
                          <td className="px-4 py-3 text-sm text-[rgba(232,228,220,0.55)]">{cost.vendor || '-'}</td>
                          <td className="px-4 py-3 text-sm text-[rgba(232,228,220,0.35)]">{cost.incurredAt ? formatDate(cost.incurredAt) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-[rgba(232,228,220,0.35)] max-w-[200px] truncate">{cost.notes || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: New Cash Adjustment
          ═══════════════════════════════════════════════════════════════════ */}
      {showAdjustmentForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[rgba(255,255,255,0.03)] rounded-2xl shadow-none max-w-md w-full mx-4 animate-fade-in">
            <div className="px-6 py-5 border-b border-[rgba(255,255,255,0.07)]">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">New Cash Adjustment</h2>
              <p className="text-sm text-[rgba(232,228,220,0.35)] mt-0.5">Record a credit or debit to your cash ledger</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Type toggle */}
              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-2">Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjType('CREDIT')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${
                      adjType === 'CREDIT'
                        ? 'border-green-500 bg-[rgba(50,200,120,0.1)] text-[#5cba80]'
                        : 'border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] text-[rgba(232,228,220,0.55)] hover:border-[rgba(255,255,255,0.1)]'
                    }`}
                  >
                    + Credit
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjType('DEBIT')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${
                      adjType === 'DEBIT'
                        ? 'border-[rgba(224,96,80,0.5)] bg-[rgba(220,80,60,0.1)] text-[#e06050]'
                        : 'border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] text-[rgba(232,228,220,0.55)] hover:border-[rgba(255,255,255,0.1)]'
                    }`}
                  >
                    - Debit
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Description *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]/20 focus:border-[#c4a35a]"
                  value={adjDescription}
                  onChange={(e) => setAdjDescription(e.target.value)}
                  placeholder="e.g., Client payment received"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Amount *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]/20 focus:border-[#c4a35a]"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Reason (optional)</label>
                <textarea
                  className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]/20 focus:border-[#c4a35a]"
                  rows={2}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Additional context..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[rgba(255,255,255,0.07)] flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAdjustmentForm(false);
                  setAdjDescription('');
                  setAdjAmount('');
                  setAdjReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAdjustment}
                disabled={submitting}
                className="px-5 py-2 bg-[#c4a35a] text-white text-sm font-medium rounded-lg hover:bg-[#b3943f] disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Saving...' : 'Save Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: New Private Cost Entry
          ═══════════════════════════════════════════════════════════════════ */}
      {showCostForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[rgba(255,255,255,0.03)] rounded-2xl shadow-none max-w-md w-full mx-4 animate-fade-in">
            <div className="px-6 py-5 border-b border-[rgba(255,255,255,0.07)]">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">New Private Cost Entry</h2>
              <p className="text-sm text-[rgba(232,228,220,0.35)] mt-0.5">Track an internal cost not visible to others</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Category *</label>
                <select
                  className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]/20 focus:border-[#c4a35a] bg-[rgba(255,255,255,0.03)]"
                  value={costCategory}
                  onChange={(e) => setCostCategory(e.target.value)}
                >
                  {Object.entries(PrivateCostCategoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Description *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]/20 focus:border-[#c4a35a]"
                  value={costDescription}
                  onChange={(e) => setCostDescription(e.target.value)}
                  placeholder="e.g., Rebar purchase for foundation"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Amount *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]/20 focus:border-[#c4a35a]"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Vendor (optional)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]/20 focus:border-[#c4a35a]"
                  value={costVendor}
                  onChange={(e) => setCostVendor(e.target.value)}
                  placeholder="e.g., ABC Supplies"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Date Incurred (optional)</label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]/20 focus:border-[#c4a35a]"
                  value={costIncurredAt}
                  onChange={(e) => setCostIncurredAt(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#e8e4dc] mb-1">Notes (optional)</label>
                <textarea
                  className="w-full px-3 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(196,163,90,0.3)]/20 focus:border-[#c4a35a]"
                  rows={2}
                  value={costNotes}
                  onChange={(e) => setCostNotes(e.target.value)}
                  placeholder="Additional details..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[rgba(255,255,255,0.07)] flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCostForm(false);
                  setCostDescription('');
                  setCostAmount('');
                  setCostCategory('LABOR');
                  setCostVendor('');
                  setCostNotes('');
                  setCostIncurredAt('');
                }}
                className="px-4 py-2 text-sm font-medium text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCost}
                disabled={submitting}
                className="px-5 py-2 bg-[#c4a35a] text-white text-sm font-medium rounded-lg hover:bg-[#b3943f] disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Saving...' : 'Save Cost Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ─── Inline Icons ─────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
