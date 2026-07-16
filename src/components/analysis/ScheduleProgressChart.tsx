'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export interface ScheduleProgressData {
  hasImportedTasks: boolean;
  totalImported: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  avgPercentComplete: number;
}

const COLORS = {
  Completed: '#5cba80',
  'In Progress': '#F5A623',
  'Not Started': 'rgba(232,228,220,0.25)',
};

/** Physical progress from an imported MS Project schedule (% Complete field) — a separate
 * signal from the workflow-state-based "State Distribution" above it. Schedule-imported tasks
 * never go through Axinfra's verify workflow, so they'd otherwise always show 100% DRAFT there;
 * this chart is where their real completion shows up instead. */
export default function ScheduleProgressChart({ data }: { data: ScheduleProgressData }) {
  if (!data.hasImportedTasks) return null;

  const segments = [
    { name: 'Completed', value: data.completed },
    { name: 'In Progress', value: data.inProgress },
    { name: 'Not Started', value: data.notStarted },
  ].filter((s) => s.value > 0);

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Schedule Progress</h3>
          <p className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">
            % Complete from the imported schedule — independent of payment-workflow state
          </p>
        </div>
        <span className="text-xs text-[rgba(232,228,220,0.4)]">{data.totalImported} imported tasks</span>
      </div>
      <div className="card-body">
        <div className="grid md:grid-cols-2 gap-4 items-center">
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={segments}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={86}
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
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12, color: 'rgba(232,228,220,0.7)' }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-6">
              <span className="text-2xl font-bold text-[#f5f1e8]">{data.avgPercentComplete}%</span>
              <span className="text-[11px] text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Avg Complete</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[rgba(92,186,128,0.08)] border border-[rgba(92,186,128,0.2)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#5cba80] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-[#5cba80] leading-none">{data.completed}</p>
                <p className="text-[10px] text-[rgba(232,228,220,0.5)] mt-1">Completed (100%)</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[rgba(245,166,35,0.08)] border border-[rgba(245,166,35,0.2)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F5A623] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-[#F5A623] leading-none">{data.inProgress}</p>
                <p className="text-[10px] text-[rgba(232,228,220,0.5)] mt-1">In progress</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[rgba(232,228,220,0.3)] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-[rgba(232,228,220,0.55)] leading-none">{data.notStarted}</p>
                <p className="text-[10px] text-[rgba(232,228,220,0.35)] mt-1">Not started</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
