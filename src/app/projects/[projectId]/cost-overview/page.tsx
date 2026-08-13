'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface CostOverviewData {
  currency: string;
  totals: { committed: number; paidToDate: number; outstanding: number };
  boq: { planned: number; submitted: number; approved: number; released: number; orderCount: number };
  directOrders: {
    ordered: number; delivered: number; paid: number; outstanding: number; variance: number;
    orders: Array<{ id: string; doNumber: string; description: string; ordered: number; billed: number | null; status: string }>;
  };
  boqAndDirectOrders: { planned: number; released: number; variance: number; variancePercent: number };
  consultantFees: { total: number; byPerson: Array<{ userId: string; name: string; fee: number }> };
  architectureFees: { total: number; paid: number; due: number; setCount: number };
  delayCost: { overheadCost: number; penaltyCost: number; opportunityCost: number; totalEstimatedCost: number; totalOverrunDays: number; isConfigured: boolean };
}

const STATUS_COLOR: Record<string, string> = {
  ORDERED: '#94a3b8', IN_PROGRESS: '#3b82f6', IN_DELIVERY: '#f5a623',
  DELIVERED: '#22c55e', QTY_VARIANCE: '#f97316', PAID: '#22c55e',
};

/**
 * Cost Overview — the single "what has this project actually cost, all-in" page.
 *
 * Every figure here previously only existed by visiting four separate pages and adding it up
 * by hand: Analysis (BOQ + Direct Orders), Payments (RA Bills, architecture fees), Roles
 * (consultant engagement fees), Execution Intelligence (Delay Cost Estimate). This page sums
 * them via the same API route, which itself reuses the exact same services those other pages
 * call — never a second, disagreeing calculation of the same number.
 *
 * CLIENT/PMC only, same audience as Analysis.
 */
export default function CostOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '...';
  const role = project?.myRole ?? '';

  const { data, isLoading: dataLoading, error } = useSWR<CostOverviewData>(
    projectId ? `/api/projects/${projectId}/cost-overview` : null,
    jsonFetcher,
  );
  const loading = projectLoading || dataLoading;
  const currency = data?.currency ?? project?.currency ?? 'INR';

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={role} />

      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>Cost Overview</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
            Every cost category on this project, in one place — BOQ, Direct Orders, consultant fees, architecture fees, and delay cost exposure.
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'var(--ax-card)' }} />)}
          </div>
        ) : error || !data ? (
          <div className="alert alert-error">Could not load cost overview.</div>
        ) : (
          <>
            {/* Headline totals */}
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label="Total Committed Cost" value={formatCurrency(data.totals.committed, currency)}
                subtext="BOQ + Direct Orders (planned) + Consultant fees + Architecture fees" />
              <StatCard label="Paid to Date" value={formatCurrency(data.totals.paidToDate, currency)} color="green"
                subtext="RA Bills released + Direct Orders paid + Architecture fees paid" />
              <StatCard label="Outstanding" value={formatCurrency(data.totals.outstanding, currency)}
                color={data.totals.outstanding > 0 ? 'orange' : 'green'}
                subtext="Committed minus paid to date" />
            </div>

            {/* BOQ (Purchase Orders) */}
            <Section title="BOQ (Purchase Orders)" subtitle={`${data.boq.orderCount} purchase order(s) with BOQ items`}>
              <ProgressBar planned={data.boq.planned} released={data.boq.released} currency={currency} />
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 mt-4">
                <MiniStat label="Planned" value={formatCurrency(data.boq.planned, currency)} />
                <MiniStat label="Submitted" value={formatCurrency(data.boq.submitted, currency)} />
                <MiniStat label="Approved" value={formatCurrency(data.boq.approved, currency)} />
                <MiniStat label="Released" value={formatCurrency(data.boq.released, currency)} color="green" />
              </div>
            </Section>

            {/* Direct Orders */}
            <Section title="Direct Orders" subtitle="One-off vendor purchases outside the BOQ flow (e.g. HVAC, Electrical, Civil)">
              <ProgressBar planned={data.directOrders.ordered} released={data.directOrders.paid} currency={currency} />
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 mt-4 mb-4">
                <MiniStat label="Ordered" value={formatCurrency(data.directOrders.ordered, currency)} />
                <MiniStat label="Delivered" value={formatCurrency(data.directOrders.delivered, currency)} />
                <MiniStat label="Paid" value={formatCurrency(data.directOrders.paid, currency)} color="green" />
                <MiniStat
                  label="Variance"
                  value={formatCurrency(data.directOrders.variance, currency)}
                  color={data.directOrders.variance < 0 ? 'orange' : 'gray'}
                />
              </div>

              {data.directOrders.orders.length === 0 ? (
                <EmptyRow message="No Direct Orders on this project." />
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
                        <th className="font-medium px-1 py-1.5">Order</th>
                        <th className="font-medium px-1 py-1.5">Description</th>
                        <th className="font-medium px-1 py-1.5 text-right">Ordered</th>
                        <th className="font-medium px-1 py-1.5 text-right">Billed</th>
                        <th className="font-medium px-1 py-1.5 text-right">Variance</th>
                        <th className="font-medium px-1 py-1.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.directOrders.orders.map((o) => {
                        const variance = o.billed != null ? o.ordered - o.billed : null;
                        return (
                          <tr key={o.id} style={{ borderTop: '1px solid rgba(var(--ax-text-rgb),0.07)' }}>
                            <td className="px-1 py-2 font-medium" style={{ color: 'var(--ax-text)' }}>{o.doNumber}</td>
                            <td className="px-1 py-2" style={{ color: 'rgba(var(--ax-text-rgb),0.7)', maxWidth: 320 }}>
                              <span className="line-clamp-1">{o.description}</span>
                            </td>
                            <td className="px-1 py-2 text-right" style={{ color: 'var(--ax-text)' }}>{formatCurrency(o.ordered, currency)}</td>
                            <td className="px-1 py-2 text-right" style={{ color: 'var(--ax-text)' }}>{o.billed != null ? formatCurrency(o.billed, currency) : '—'}</td>
                            <td className="px-1 py-2 text-right" style={{ color: variance != null && variance < 0 ? '#f97316' : 'rgba(var(--ax-text-rgb),0.6)' }}>
                              {variance != null ? formatCurrency(variance, currency) : '—'}
                            </td>
                            <td className="px-1 py-2 text-right">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{ color: STATUS_COLOR[o.status] ?? '#94a3b8', background: `${STATUS_COLOR[o.status] ?? '#94a3b8'}20` }}>
                                {o.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title="Consultant Fees" subtitle="Engagement fees set on the Roles page — not tracked for payment status yet">
              {data.consultantFees.byPerson.length === 0 ? (
                <EmptyRow message="No consultant fees set. Set them on the Roles page." />
              ) : (
                <div className="space-y-1.5">
                  {data.consultantFees.byPerson.map((c) => (
                    <Row key={c.userId} label={c.name} value={formatCurrency(c.fee, currency)} />
                  ))}
                  <Row label="Total" value={formatCurrency(data.consultantFees.total, currency)} bold />
                </div>
              )}
            </Section>

            <Section title="Architecture Fees" subtitle={`${data.architectureFees.setCount} drawing set(s)`}>
              <div className="grid gap-4 sm:grid-cols-3">
                <MiniStat label="Total" value={formatCurrency(data.architectureFees.total, currency)} />
                <MiniStat label="Paid" value={formatCurrency(data.architectureFees.paid, currency)} color="green" />
                <MiniStat label="Due" value={formatCurrency(data.architectureFees.due, currency)} color={data.architectureFees.due > 0 ? 'orange' : 'green'} />
              </div>
            </Section>

            <Section title="Delay Cost Estimate" subtitle="A risk/exposure projection — not a committed cost, shown separately from the total above">
              {!data.delayCost.isConfigured ? (
                <EmptyRow message="Not configured — set rates on the Execution Intelligence Analytics tab." />
              ) : (
                <div className="space-y-1.5">
                  <Row label="Overhead Cost" value={formatCurrency(data.delayCost.overheadCost, currency)} />
                  <Row label="Penalty Cost" value={formatCurrency(data.delayCost.penaltyCost, currency)} />
                  <Row label="Opportunity Cost" value={formatCurrency(data.delayCost.opportunityCost, currency)} />
                  <Row label={`Total Estimate (${data.delayCost.totalOverrunDays} overrun days)`} value={formatCurrency(data.delayCost.totalEstimatedCost, currency)} bold />
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </Layout>
  );
}

function StatCard({ label, value, subtext, color = 'gray' }: { label: string; value: string; subtext?: string; color?: 'gray' | 'green' | 'orange' }) {
  const colors = { gray: 'var(--ax-text)', green: '#22c55e', orange: '#f5a623' };
  return (
    <div className="card"><div className="card-body">
      <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: colors[color] }}>{value}</p>
      {subtext && <p className="text-xs mt-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>{subtext}</p>}
    </div></div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card"><div className="card-body">
      <h3 className="text-base font-semibold" style={{ color: 'var(--ax-text)' }}>{title}</h3>
      {subtitle && <p className="text-xs mb-3 mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div></div>
  );
}

/** Horizontal "released as a % of planned" bar — the same released/planned pair each section
 * already shows as numbers, just made scannable at a glance without reading digits. */
function ProgressBar({ planned, released, currency }: { planned: number; released: number; currency: string }) {
  const pct = planned > 0 ? Math.min(100, Math.round((released / planned) * 100)) : 0;
  const overPct = planned > 0 && released > planned ? Math.min(100, Math.round((planned / released) * 100)) : null;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>
          {overPct != null
            ? `Released ${formatCurrency(released, currency)} — over the planned ${formatCurrency(planned, currency)}`
            : `${pct}% released`}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(var(--ax-text-rgb),0.08)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${overPct != null ? 100 : pct}%`, background: overPct != null ? '#f97316' : '#22c55e' }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color = 'gray' }: { label: string; value: string; color?: 'gray' | 'green' | 'orange' }) {
  const colors = { gray: 'var(--ax-text)', green: '#22c55e', orange: '#f5a623' };
  return (
    <div>
      <p className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>{label}</p>
      <p className="text-lg font-semibold" style={{ color: colors[color] }}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5" style={{ borderTop: bold ? '1px solid rgba(var(--ax-text-rgb),0.1)' : undefined }}>
      <span className={`text-sm ${bold ? 'font-semibold' : ''}`} style={{ color: bold ? 'var(--ax-text)' : 'rgba(var(--ax-text-rgb),0.65)' }}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'}`} style={{ color: 'var(--ax-text)' }}>{value}</span>
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="text-sm py-4 text-center" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>{message}</p>;
}
