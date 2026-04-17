'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

interface VendorScore {
  vendorName: string;
  total: number;
  onTime: number;
  late: number;
  reliability: number;
  avgDelay: number;
}

interface VendorRankingsProps {
  vendors: VendorScore[];
}

export default function VendorRankings({ vendors }: VendorRankingsProps) {
  if (vendors.length === 0) {
    return (
      <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
        <h3 className="text-[14px] font-semibold text-[#e8e4dc] mb-1">Vendor Rankings</h3>
        <p className="text-[12px] text-[rgba(232,228,220,0.35)] mb-6">Performance leaderboard</p>
        <div className="flex items-center justify-center py-10 text-[13px] text-[rgba(232,228,220,0.35)]">
          No vendor data available
        </div>
      </div>
    );
  }

  const sorted = [...vendors].sort((a, b) => b.reliability - a.reliability);

  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
      <h3 className="text-[14px] font-semibold text-[#e8e4dc] mb-1">Vendor Rankings</h3>
      <p className="text-[12px] text-[rgba(232,228,220,0.35)] mb-5">Performance leaderboard by reliability</p>

      {/* Leaderboard */}
      <div className="space-y-0 mb-6">
        {sorted.map((v, idx) => (
          <div
            key={v.vendorName}
            className="flex items-center gap-3 px-3 py-3 -mx-3 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
          >
            {/* Rank badge */}
            <div className="shrink-0">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold
                  ${idx === 0
                    ? 'bg-[rgba(196,163,90,0.15)] text-[#c4a35a] ring-2 ring-[rgba(196,163,90,0.3)]'
                    : idx === 1
                      ? 'bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)] ring-1 ring-[rgba(255,255,255,0.1)]'
                      : idx === 2
                        ? 'bg-[rgba(196,163,90,0.08)] text-[#c4a35a] ring-1 ring-[rgba(196,163,90,0.2)]'
                        : 'bg-[rgba(255,255,255,0.03)] text-[rgba(232,228,220,0.35)]'
                  }`}
              >
                {idx + 1}
              </span>
            </div>

            {/* Vendor info */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#e8e4dc] truncate">{v.vendorName}</p>
              <p className="text-[11px] text-[rgba(232,228,220,0.35)] mt-0.5">
                {v.total} milestones &middot; {v.onTime} on-time &middot; {v.late} late
              </p>
            </div>

            {/* Reliability bar + score */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-20 h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${v.reliability}%`,
                    background:
                      v.reliability >= 80
                        ? '#12B76A'
                        : v.reliability >= 60
                          ? '#F79009'
                          : '#F04438',
                  }}
                />
              </div>
              <span
                className={`text-[13px] font-bold tabular-nums w-10 text-right ${
                  v.reliability >= 80
                    ? 'text-[#5cba80]'
                    : v.reliability >= 60
                      ? 'text-[#c4a35a]'
                      : 'text-[#e06050]'
                }`}
              >
                {v.reliability}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      {sorted.length > 1 && (
        <div className="border-t border-[rgba(255,255,255,0.07)] pt-5">
          <p className="text-[11px] font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider mb-3">
            Reliability Comparison
          </p>
          <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 44)}>
            <BarChart
              data={sorted}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 4, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'rgba(232,228,220,0.45)' }} unit="%" />
              <YAxis
                dataKey="vendorName"
                type="category"
                tick={{ fontSize: 11, fill: 'rgba(232,228,220,0.55)' }}
                width={100}
              />
              <Tooltip
                formatter={(value: number) => `${value}%`}
                labelStyle={{ fontSize: 12, fontWeight: 600, color: '#e8e4dc' }}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: '#1a1c22',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  fontSize: 12,
                  color: '#e8e4dc',
                }}
              />
              <ReferenceLine
                x={80}
                stroke="#22c55e"
                strokeDasharray="3 2"
                label={{ value: '80%', fontSize: 9, fill: '#22c55e' }}
              />
              <Bar dataKey="reliability" name="Reliability" radius={[0, 4, 4, 0]} barSize={20}>
                {sorted.map((v) => (
                  <Cell
                    key={v.vendorName}
                    fill={
                      v.reliability >= 80
                        ? '#12B76A'
                        : v.reliability >= 60
                          ? '#F79009'
                          : '#F04438'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Avg delay callout */}
      {sorted.some((v) => v.avgDelay > 0) && (
        <div className="border-t border-[rgba(255,255,255,0.07)] pt-4 mt-4">
          <p className="text-[11px] font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider mb-3">
            Average Delay (days)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sorted
              .filter((v) => v.avgDelay > 0)
              .map((v) => (
                <div
                  key={v.vendorName}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.03)]"
                >
                  <span className="text-[12px] text-[rgba(232,228,220,0.55)] truncate mr-2">{v.vendorName}</span>
                  <span className="text-[13px] font-bold text-[#e06050] tabular-nums shrink-0">
                    {v.avgDelay}d
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
