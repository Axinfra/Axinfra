'use client';

interface RiskyMilestone {
  id: string;
  title: string;
  state: string;
  vendorName: string | null;
  daysRemaining: number | null;
  riskLevel: string;
  value: number;
}

interface RiskPanelProps {
  milestones: RiskyMilestone[];
}

export default function RiskPanel({ milestones }: RiskPanelProps) {
  if (milestones.length === 0) {
    return (
      <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-6">
        <h3 className="text-[14px] font-semibold text-[var(--ax-text)] mb-1">Risk Assessment</h3>
        <p className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)] mb-6">Milestones flagged by risk level</p>
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <div className="w-10 h-10 rounded-full bg-[rgba(50,200,120,0.1)] flex items-center justify-center">
            <ShieldCheckIcon className="w-5 h-5 text-[#5cba80]" />
          </div>
          <p className="text-[13px] text-[rgba(var(--ax-text-rgb),0.55)] font-medium">All clear</p>
          <p className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)]">No milestones are currently at risk</p>
        </div>
      </div>
    );
  }

  const critical = milestones.filter((m) => m.riskLevel === 'critical');
  const high = milestones.filter((m) => m.riskLevel === 'high');
  const medium = milestones.filter((m) => m.riskLevel === 'medium');
  const totalRiskValue = milestones.reduce((s, m) => s + m.value, 0);

  return (
    <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--ax-text)] mb-1">Risk Assessment</h3>
          <p className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)]">
            {milestones.length} milestone{milestones.length !== 1 ? 's' : ''} flagged
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] uppercase tracking-wider">Value at Risk</p>
          <p className="text-[16px] font-bold text-[#e06050] tabular-nums">{formatCurrency(totalRiskValue)}</p>
        </div>
      </div>

      {/* Risk level summary pills */}
      <div className="flex gap-2 mb-5">
        {critical.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(224,96,80,0.08)] border border-[rgba(224,96,80,0.15)] text-[11px] font-semibold text-[#e06050]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e06050] animate-pulse" />
            {critical.length} Critical
          </span>
        )}
        {high.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.15)] text-[11px] font-semibold text-[#f59e0b]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
            {high.length} High
          </span>
        )}
        {medium.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(var(--ax-accent-rgb),0.08)] border border-[rgba(var(--ax-accent-rgb),0.15)] text-[11px] font-semibold text-[var(--ax-accent)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ax-accent)]" />
            {medium.length} Medium
          </span>
        )}
      </div>

      {/* Milestone list */}
      <div className="space-y-0">
        {milestones.slice(0, 8).map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 px-3 py-3 -mx-3 rounded-lg hover:bg-[var(--ax-overlay-hover)] transition-colors group"
          >
            {/* Risk indicator */}
            <div className="shrink-0">
              <div
                className={`w-2 h-8 rounded-full ${
                  m.riskLevel === 'critical'
                    ? 'bg-[#e06050]'
                    : m.riskLevel === 'high'
                      ? 'bg-[#f59e0b]'
                      : 'bg-[var(--ax-accent)]'
                }`}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--ax-text)] truncate">{m.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[11px] font-medium ${stateColor(m.state)}`}>
                  {m.state.replace(/_/g, ' ')}
                </span>
                {m.vendorName && (
                  <>
                    <span className="text-[rgba(var(--ax-text-rgb),0.12)]">&middot;</span>
                    <span className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)]">{m.vendorName}</span>
                  </>
                )}
              </div>
            </div>

            {/* Days indicator */}
            <div className="text-right shrink-0">
              {m.daysRemaining !== null && m.daysRemaining < 0 ? (
                <p className="text-[13px] font-bold text-[#e06050] tabular-nums">
                  {Math.abs(m.daysRemaining)}d overdue
                </p>
              ) : m.daysRemaining !== null ? (
                <p className="text-[13px] font-medium text-[#f59e0b] tabular-nums">
                  {m.daysRemaining}d left
                </p>
              ) : (
                <p className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)]">No date</p>
              )}
              {m.value > 0 && (
                <p className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] tabular-nums">{formatCurrency(m.value)}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {milestones.length > 8 && (
        <p className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)] text-center mt-3">
          + {milestones.length - 8} more flagged milestones
        </p>
      )}
    </div>
  );
}

function stateColor(state: string) {
  switch (state) {
    case 'DRAFT': return 'text-[rgba(var(--ax-text-rgb),0.55)]';
    case 'IN_PROGRESS': return 'text-[var(--ax-accent)]';
    case 'SUBMITTED': return 'text-[#f59e0b]';
    default: return 'text-[rgba(var(--ax-text-rgb),0.55)]';
  }
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: n >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}
