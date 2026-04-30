'use client';

import useSWR from 'swr';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import { jsonFetcher } from '@/lib/fetcher';
import ChartCard from './ChartCard';

interface Item {
  projectId: string;
  projectName: string;
  completed: number;
  total: number;
  percent: number;
}

const ACCENT = '#F5A623';

export default function MilestoneCompletionChart() {
  const { data, error, isLoading } = useSWR<Item[]>(
    '/api/dashboard/milestone-completion',
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const items = data ?? [];

  return (
    <ChartCard
      title="Milestone Completion Rate"
      subtitle="Percent of milestones verified or closed, per project"
      isLoading={isLoading}
      error={error}
      isEmpty={items.length === 0}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={items} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
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
            domain={[0, 100]}
            tick={{ fill: 'rgba(232,228,220,0.6)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            tickLine={false}
            unit="%"
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
            formatter={(value: number, _name, props) => {
              const item = props.payload as Item;
              return [`${value}% (${item.completed}/${item.total})`, 'Complete'];
            }}
            labelStyle={{ color: '#f5f1e8', fontWeight: 600 }}
          />
          <Bar dataKey="percent" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {items.map((it) => (
              <Cell key={it.projectId} fill={ACCENT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
