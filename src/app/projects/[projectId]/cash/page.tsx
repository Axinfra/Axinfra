'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { PrivateCostCategoryLabels, CashSummary } from '@/types';

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

  // Project info
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('adjustments');

  // Data
  const [adjustments, setAdjustments] = useState<CashAdjustment[]>([]);
  const [adjustmentsTotal, setAdjustmentsTotal] = useState(0);
  const [costs, setCosts] = useState<PrivateCost[]>([]);
  const [costsTotal, setCostsTotal] = useState(0);
  const [summary, setSummary] = useState<CashSummary | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
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

  // ─── Data Loading ───────────────────────────────────────────────────────

  const loadProjectInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (data.success) {
        setProjectName(data.data.name);
        setMyRole(data.data.myRole);
      }
    } catch {
      // Non-critical
    }
  }, [projectId]);

  const loadCashData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/cash`);
      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setAdjustments(data.data.adjustments);
        setAdjustmentsTotal(data.data.total);
        setSummary(data.data.summary);
      } else {
        setError(data.error || 'Failed to load cash data');
      }
    } catch {
      setError('Failed to load cash data');
    }
  }, [projectId]);

  const loadCosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/cash/costs`);
      const data = await res.json();
      if (data.success) {
        setCosts(data.data.costs);
        setCostsTotal(data.data.total);
      }
    } catch {
      // Non-critical for initial load
    }
  }, [projectId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadProjectInfo(), loadCashData(), loadCosts()]);
      setLoading(false);
    };
    load();
  }, [loadProjectInfo, loadCashData, loadCosts]);

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
        await loadCashData();
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
        await Promise.all([loadCosts(), loadCashData()]);
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
        <div className="text-center py-12 text-surface-500">Loading Cash Module...</div>
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
          <h2 className="text-xl font-semibold text-surface-900 mb-2">Access Denied</h2>
          <p className="text-sm text-surface-500 mb-6">The Cash Module is restricted to the Builder role.</p>
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
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
            <h1 className="text-2xl font-bold text-surface-900">Builder Cash Module</h1>
            <p className="text-sm text-surface-500 mt-1">Private financial tracking — visible only to you</p>
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
            <div className="bg-white rounded-xl border border-surface-200 p-5">
              <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Total Credits</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(summary.totalCredits)}</p>
              <p className="text-xs text-surface-400 mt-1">{summary.adjustmentCount} adjustments</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-5">
              <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Total Debits</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(summary.totalDebits)}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-5">
              <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Net Cash Position</p>
              <p className={`text-2xl font-bold mt-1 ${summary.netCashPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.netCashPosition)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-5">
              <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Private Costs</p>
              <p className="text-2xl font-bold text-surface-900 mt-1">{formatCurrency(summary.totalPrivateCosts)}</p>
              <p className="text-xs text-surface-400 mt-1">{summary.costEntryCount} entries</p>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="border-b border-surface-200">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('adjustments')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-all duration-200 rounded-t-md ${
                activeTab === 'adjustments'
                  ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              }`}
            >
              Cash Adjustments
              <span className="ml-2 text-xs bg-surface-100 text-surface-600 rounded-full px-2 py-0.5">
                {adjustmentsTotal}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('costs')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-all duration-200 rounded-t-md ${
                activeTab === 'costs'
                  ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              }`}
            >
              Private Cost Entries
              <span className="ml-2 text-xs bg-surface-100 text-surface-600 rounded-full px-2 py-0.5">
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                <PlusIcon />
                New Adjustment
              </button>
            </div>

            {/* Adjustment Table */}
            <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-surface-50 border-b border-surface-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Created By</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {adjustments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-surface-400">
                          No cash adjustments yet. Click &quot;New Adjustment&quot; to add one.
                        </td>
                      </tr>
                    ) : (
                      adjustments.map((adj) => (
                        <tr key={adj.id} className="hover:bg-surface-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                adj.type === 'CREDIT'
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {adj.type === 'CREDIT' ? '+ Credit' : '- Debit'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-surface-900">{adj.description}</td>
                          <td className={`px-4 py-3 text-sm font-semibold text-right ${adj.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                            {adj.type === 'CREDIT' ? '+' : '-'}{formatCurrency(adj.amount)}
                          </td>
                          <td className="px-4 py-3 text-sm text-surface-500">{adj.reason || '-'}</td>
                          <td className="px-4 py-3 text-sm text-surface-500">{adj.createdBy.name}</td>
                          <td className="px-4 py-3 text-sm text-surface-400">{formatDateTime(adj.createdAt)}</td>
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
                    <span key={cat} className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-50 border border-surface-200 rounded-full text-xs text-surface-600">
                      <span className="font-medium">{PrivateCostCategoryLabels[cat as keyof typeof PrivateCostCategoryLabels] || cat}</span>
                      <span className="text-surface-400">{formatCurrency(total)}</span>
                    </span>
                  ))}
                </div>
              )}
              {(!summary || Object.keys(summary.costsByCategory).length === 0) && <div />}
              <button
                onClick={() => setShowCostForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors shrink-0"
              >
                <PlusIcon />
                New Cost Entry
              </button>
            </div>

            {/* Costs Table */}
            <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-surface-50 border-b border-surface-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Incurred</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {costs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-surface-400">
                          No private cost entries yet. Click &quot;New Cost Entry&quot; to add one.
                        </td>
                      </tr>
                    ) : (
                      costs.map((cost) => (
                        <tr key={cost.id} className="hover:bg-surface-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2.5 py-1 bg-surface-50 border border-surface-200 rounded-full text-xs font-medium text-surface-700">
                              {PrivateCostCategoryLabels[cost.category as keyof typeof PrivateCostCategoryLabels] || cost.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-surface-900">{cost.description}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-right text-surface-900">{formatCurrency(cost.amount)}</td>
                          <td className="px-4 py-3 text-sm text-surface-500">{cost.vendor || '-'}</td>
                          <td className="px-4 py-3 text-sm text-surface-400">{cost.incurredAt ? formatDate(cost.incurredAt) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-surface-400 max-w-[200px] truncate">{cost.notes || '-'}</td>
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
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 animate-fade-in">
            <div className="px-6 py-5 border-b border-surface-100">
              <h2 className="text-lg font-semibold text-surface-900">New Cash Adjustment</h2>
              <p className="text-sm text-surface-400 mt-0.5">Record a credit or debit to your cash ledger</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Type toggle */}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjType('CREDIT')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${
                      adjType === 'CREDIT'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-surface-200 bg-white text-surface-500 hover:border-surface-300'
                    }`}
                  >
                    + Credit
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjType('DEBIT')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${
                      adjType === 'DEBIT'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-surface-200 bg-white text-surface-500 hover:border-surface-300'
                    }`}
                  >
                    - Debit
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Description *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  value={adjDescription}
                  onChange={(e) => setAdjDescription(e.target.value)}
                  placeholder="e.g., Client payment received"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Amount *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Reason (optional)</label>
                <textarea
                  className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  rows={2}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Additional context..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-surface-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAdjustmentForm(false);
                  setAdjDescription('');
                  setAdjAmount('');
                  setAdjReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAdjustment}
                disabled={submitting}
                className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
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
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 animate-fade-in">
            <div className="px-6 py-5 border-b border-surface-100">
              <h2 className="text-lg font-semibold text-surface-900">New Private Cost Entry</h2>
              <p className="text-sm text-surface-400 mt-0.5">Track an internal cost not visible to others</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Category *</label>
                <select
                  className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                  value={costCategory}
                  onChange={(e) => setCostCategory(e.target.value)}
                >
                  {Object.entries(PrivateCostCategoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Description *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  value={costDescription}
                  onChange={(e) => setCostDescription(e.target.value)}
                  placeholder="e.g., Rebar purchase for foundation"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Amount *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Vendor (optional)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  value={costVendor}
                  onChange={(e) => setCostVendor(e.target.value)}
                  placeholder="e.g., ABC Supplies"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Date Incurred (optional)</label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  value={costIncurredAt}
                  onChange={(e) => setCostIncurredAt(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Notes (optional)</label>
                <textarea
                  className="w-full px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  rows={2}
                  value={costNotes}
                  onChange={(e) => setCostNotes(e.target.value)}
                  placeholder="Additional details..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-surface-100 flex justify-end gap-3">
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
                className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCost}
                disabled={submitting}
                className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
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
