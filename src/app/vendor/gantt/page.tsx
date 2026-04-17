'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import { Loader2 } from 'lucide-react';

interface GanttMilestone {
  id: string;
  title: string;
  state: string;
  sortOrder: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  baselinePlannedStart: string | null;
  baselinePlannedEnd: string | null;
  value: number;
  isCritical: boolean;
  totalFloat: number | null;
}

export default function VendorGanttPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [milestones, setMilestones] = useState<GanttMilestone[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/vendor/portal?view=gantt');
      const data = await res.json();
      if (!data.success) {
        if (res.status === 401) { router.push('/auth/login'); return; }
        if (res.status === 403) { router.push('/projects'); return; }
        setError(data.error);
        return;
      }
      setProjectName(data.data.projectName);
      setMilestones(data.data.milestones);
    } catch {
      setError('Failed to load gantt data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Compute date range
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const allDates: number[] = [];
    for (const m of milestones) {
      if (m.plannedStart) allDates.push(new Date(m.plannedStart).getTime());
      if (m.plannedEnd) allDates.push(new Date(m.plannedEnd).getTime());
      if (m.actualStart) allDates.push(new Date(m.actualStart).getTime());
      if (m.actualEnd) allDates.push(new Date(m.actualEnd).getTime());
    }
    if (allDates.length === 0) {
      const now = Date.now();
      return { minDate: now, maxDate: now + 90 * 86400000, totalDays: 90 };
    }
    const min = Math.min(...allDates);
    const max = Math.max(...allDates);
    const days = Math.max(Math.ceil((max - min) / 86400000), 7);
    return { minDate: min - 86400000, maxDate: max + 86400000, totalDays: days + 2 };
  }, [milestones]);

  const barPosition = (start: string | null, end: string | null) => {
    if (!start || !end) return null;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const left = ((s - minDate) / (maxDate - minDate)) * 100;
    const width = ((e - s) / (maxDate - minDate)) * 100;
    return { left: `${Math.max(left, 0)}%`, width: `${Math.max(width, 0.5)}%` };
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[rgba(232,228,220,0.35)]" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="text-center py-20 text-[#e06050]">{error}</div>
      </Layout>
    );
  }

  // Month labels
  const monthLabels: Array<{ label: string; left: string }> = [];
  const cursor = new Date(minDate);
  cursor.setDate(1);
  while (cursor.getTime() <= maxDate) {
    const pos = ((cursor.getTime() - minDate) / (maxDate - minDate)) * 100;
    if (pos >= 0 && pos <= 100) {
      monthLabels.push({
        label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        left: `${pos}%`,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <Layout>
      <VendorNav projectName={projectName} />

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-[#e8e4dc]">Your Milestones &mdash; Gantt</h2>
          <div className="flex items-center gap-3 text-[11px] text-[rgba(232,228,220,0.55)]">
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm bg-teal-400 inline-block" /> Planned
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm bg-[rgba(196,163,90,0.08)]0 inline-block" /> Actual
            </span>
          </div>
        </div>

        {milestones.length === 0 ? (
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-10 text-center text-[rgba(232,228,220,0.35)] text-sm">
            No milestones to display.
          </div>
        ) : (
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
            {/* Month header */}
            <div className="relative h-8 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)]">
              {monthLabels.map((ml, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 text-[10px] text-[rgba(232,228,220,0.35)] font-medium"
                  style={{ left: ml.left }}
                >
                  {ml.label}
                </span>
              ))}
            </div>

            {/* Rows */}
            {milestones.map((m) => {
              const planned = barPosition(m.plannedStart, m.plannedEnd);
              const actual = barPosition(m.actualStart, m.actualEnd);

              return (
                <div key={m.id} className="flex items-center border-b border-surface-50 last:border-0 hover:bg-[rgba(255,255,255,0.05)]/50">
                  {/* Label */}
                  <div className="w-48 shrink-0 px-4 py-3">
                    <p className="text-[12px] font-medium text-[#e8e4dc] truncate">{m.title}</p>
                    <p className="text-[10px] text-[rgba(232,228,220,0.35)]">{m.state.replace(/_/g, ' ')}</p>
                  </div>
                  {/* Chart area */}
                  <div className="flex-1 relative h-12 min-w-0">
                    {planned && (
                      <div
                        className="absolute top-2 h-3 rounded-sm bg-teal-200"
                        style={{ left: planned.left, width: planned.width }}
                        title={`Planned: ${m.plannedStart?.slice(0, 10)} → ${m.plannedEnd?.slice(0, 10)}`}
                      />
                    )}
                    {actual && (
                      <div
                        className="absolute top-6 h-3 rounded-sm bg-[rgba(196,163,90,0.08)]0"
                        style={{ left: actual.left, width: actual.width }}
                        title={`Actual: ${m.actualStart?.slice(0, 10)} → ${m.actualEnd?.slice(0, 10)}`}
                      />
                    )}
                    {m.isCritical && (
                      <div className="absolute top-0 right-2 text-[9px] text-red-500 font-medium">
                        CRITICAL
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
