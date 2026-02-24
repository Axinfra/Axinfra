'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import { Loader2 } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

interface SCurvePoint {
  date: string;
  plannedCumulative: number;
  actualCumulative: number;
}

interface DelayBucket {
  bucket: string;
  count: number;
}

interface OnTimeTrend {
  month: string;
  onTimePct: number;
}

interface VendorAnalyticsKPIs {
  netScheduleDays: number;
  totalSavedDays: number;
  totalOverrunDays: number;
  onTimePct: number;
  avgApprovalCycleDays: number;
  completedMilestones: number;
  totalMilestones: number;
}

export default function VendorAnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [activeTab, setActiveTab] = useState<'scurve' | 'delay' | 'payment' | 'ontime'>('scurve');

  const [kpis, setKpis] = useState<VendorAnalyticsKPIs | null>(null);
  const [sCurve, setSCurve] = useState<SCurvePoint[]>([]);
  const [delayHistogram, setDelayHistogram] = useState<DelayBucket[]>([]);
  const [paymentCycleDays, setPaymentCycleDays] = useState<{ avg: number }>({ avg: 0 });
  const [onTimeTrend, setOnTimeTrend] = useState<OnTimeTrend[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/vendor/portal?view=analytics');
      const data = await res.json();
      if (!data.success) {
        if (res.status === 401) { router.push('/auth/login'); return; }
        if (res.status === 403) { router.push('/projects'); return; }
        setError(data.error);
        return;
      }
      setProjectName(data.data.projectName);
      setKpis(data.data.kpis);
      setSCurve(data.data.sCurve);
      setDelayHistogram(data.data.delayHistogram);
      setPaymentCycleDays(data.data.paymentCycleDays);
      setOnTimeTrend(data.data.onTimeTrend);
    } catch {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="text-center py-20 text-red-600">{error}</div>
      </Layout>
    );
  }

  const tabs = [
    { id: 'scurve' as const, label: 'S-Curve' },
    { id: 'delay' as const, label: 'Delay Distribution' },
    { id: 'payment' as const, label: 'Payment Cycle' },
    { id: 'ontime' as const, label: 'On-time % Trend' },
  ];

  return (
    <Layout>
      <VendorNav projectName={projectName} />

      <div className="space-y-6">
        {/* KPI summary */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniKpi label="On-time %" value={`${kpis.onTimePct}%`} />
            <MiniKpi label="Schedule Days" value={kpis.netScheduleDays >= 0 ? `+${kpis.netScheduleDays}d` : `${kpis.netScheduleDays}d`} />
            <MiniKpi label="Approval Cycle" value={`${kpis.avgApprovalCycleDays}d`} />
            <MiniKpi label="Completed" value={`${kpis.completedMilestones}/${kpis.totalMilestones}`} />
          </div>
        )}

        {/* Sub-tabs */}
        <div className="flex items-center gap-1 bg-surface-50 p-1 rounded-lg w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors
                ${activeTab === tab.id
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Chart area */}
        <div className="bg-white border border-surface-200 rounded-xl p-6">
          {activeTab === 'scurve' && (
            <div>
              <h3 className="text-sm font-semibold text-surface-900 mb-4">S-Curve (Cumulative Value)</h3>
              {sCurve.length === 0 ? (
                <p className="text-sm text-surface-400 text-center py-10">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={sCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="plannedCumulative" stroke="#14b8a6" fill="#ccfbf1" name="Planned" />
                    <Area type="monotone" dataKey="actualCumulative" stroke="#3b82f6" fill="#dbeafe" name="Actual" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {activeTab === 'delay' && (
            <div>
              <h3 className="text-sm font-semibold text-surface-900 mb-4">Delay Distribution</h3>
              {delayHistogram.length === 0 ? (
                <p className="text-sm text-surface-400 text-center py-10">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={delayHistogram}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Milestones" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {activeTab === 'payment' && (
            <div>
              <h3 className="text-sm font-semibold text-surface-900 mb-4">Payment Cycle Days</h3>
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-4xl font-bold text-teal-600">{paymentCycleDays.avg}</p>
                  <p className="text-sm text-surface-500 mt-2">Avg days from evidence to payment eligibility</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ontime' && (
            <div>
              <h3 className="text-sm font-semibold text-surface-900 mb-4">On-time % Trend (6 months)</h3>
              {onTimeTrend.length === 0 ? (
                <p className="text-sm text-surface-400 text-center py-10">No data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={onTimeTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="onTimePct" stroke="#14b8a6" strokeWidth={2} dot={{ r: 4 }} name="On-time %" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-surface-200 rounded-xl p-4">
      <p className="text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-semibold text-surface-900">{value}</p>
    </div>
  );
}
