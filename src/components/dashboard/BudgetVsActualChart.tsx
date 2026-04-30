'use client';

import useSWR from 'swr';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency } from '@/lib/utils';
import ChartCard from './ChartCard';

interface Item {
  projectId: string;
  projectName: string;
  budgeted: number;
  actual: number;
}

const STEEL_BLUE = '#4A90D9';
const AMBER = '#F5A623';

function compactCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function BudgetVsActualChart() {
  const { data, error, isLoading } = useSWR<Item[]>(
    '/api/dashboard/budget-vs-actual',
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const items = data ?? [];

  return (
    <ChartCard
      title="Budget vs Actual Spend"
      subtitle="BOQ planned value vs amount paid, per project"
      isLoading={isLoading}
      error={error}
      isEmpty={items.length === 0}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={items} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="projectName"
            tick={{ fill: 'rgba(232,228,220,0.6)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickLine={false}
            interval={0}
            angle={items.length > 4 ? -20 : 0}
            textAnchor={items.length > 4 ? 'end' : 'middle'}
            height={items.length > 4 ? 50 : 30}
          />
          <YAxis
            tick={{ fill: 'rgba(232,228,220,0.6)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickLine={false}
            tickFormatter={compactCurrency}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{
              backgroundColor: '#13151a',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: '#e8e4dc',
              fontSize: 12,
            }}
            formatter={(value: number) => formatCurrency(value)}
            labelStyle={{ color: '#f5f1e8', fontWeight: 600 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: 'rgba(232,228,220,0.7)', paddingTop: 6 }}
            iconType="circle"
          />
          <Bar dataKey="budgeted" name="Budget" fill={STEEL_BLUE} radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey="actual" name="Actual" fill={AMBER} radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
