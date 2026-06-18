'use client';

import useSWR from 'swr';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { jsonFetcher } from '@/lib/fetcher';
import ChartCard from './ChartCard';

interface PaymentStatusData {
  pending: number;
  approved: number;
  disputed: number;
  total: number;
}

const COLORS = {
  Approved: '#5cba80',  // green — matches existing badge-eligible / badge-paid
  Pending: '#F5A623',   // amber — matches design accent
  Disputed: '#e06050',  // red — matches existing badge-blocked
};

export default function PaymentStatusChart() {
  const { data, error, isLoading } = useSWR<PaymentStatusData>(
    '/api/dashboard/payment-status',
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const payload = data;
  const segments = payload
    ? [
        { name: 'Approved', value: payload.approved },
        { name: 'Pending', value: payload.pending },
        { name: 'Disputed', value: payload.disputed },
      ].filter((s) => s.value > 0)
    : [];

  return (
    <ChartCard
      title="Payment Status"
      subtitle="Distribution of payment eligibility states across active projects"
      isLoading={isLoading}
      error={error}
      isEmpty={!payload || payload.total === 0}
    >
      <div className="relative">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={segments.length > 1 ? 2 : 0}
              stroke="rgba(255,255,255,0.04)"
            >
              {segments.map((s) => (
                <Cell key={s.name} fill={COLORS[s.name as keyof typeof COLORS]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#13151a',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                color: 'var(--ax-text)',
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--ax-text)', fontWeight: 600 }}
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: 12, color: 'rgba(var(--ax-text-rgb),0.7)' }}
              iconType="circle"
            />
          </PieChart>
        </ResponsiveContainer>
        {payload && payload.total > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
            <span className="text-2xl font-bold text-[#f5f1e8]">{payload.total}</span>
            <span className="text-[11px] text-[rgba(232,228,220,0.55)] uppercase tracking-wider">
              Payments
            </span>
          </div>
        )}
      </div>
    </ChartCard>
  );
}
