'use client';

interface HealthGaugeProps {
  score: number; // 0-100
  label: string; // "Excellent", "Good", "Fair", "At Risk", "Critical"
  size?: 'sm' | 'md' | 'lg';
}

export default function HealthGauge({ score, label, size = 'md' }: HealthGaugeProps) {
  const dimensions = { sm: 120, md: 180, lg: 240 };
  const dim = dimensions[size];
  const strokeWidth = size === 'sm' ? 8 : size === 'md' ? 10 : 14;
  const radius = (dim - strokeWidth) / 2 - 4;
  const circumference = Math.PI * radius; // half circle
  const progress = (score / 100) * circumference;
  const cx = dim / 2;
  const cy = dim / 2 + radius * 0.1;

  // Color based on score
  const getColor = (s: number) => {
    if (s >= 90) return { stroke: '#12B76A', glow: 'rgba(18, 183, 106, 0.3)', text: 'text-[#5cba80]' };
    if (s >= 80) return { stroke: '#12B76A', glow: 'rgba(18, 183, 106, 0.2)', text: 'text-[#5cba80]' };
    if (s >= 60) return { stroke: '#F79009', glow: 'rgba(247, 144, 9, 0.25)', text: 'text-[var(--ax-accent)]' };
    if (s >= 40) return { stroke: '#F79009', glow: 'rgba(247, 144, 9, 0.2)', text: 'text-[var(--ax-accent)]' };
    return { stroke: '#F04438', glow: 'rgba(240, 68, 56, 0.3)', text: 'text-[#e06050]' };
  };

  const color = getColor(score);
  const fontSize = size === 'sm' ? 'text-2xl' : size === 'md' ? 'text-4xl' : 'text-5xl';
  const labelSize = size === 'sm' ? 'text-[10px]' : 'text-[12px]';

  return (
    <div className="flex flex-col items-center">
      <svg width={dim} height={dim * 0.65} viewBox={`0 0 ${dim} ${dim * 0.65}`} className="overflow-visible">
        <defs>
          <filter id={`gauge-glow-${score}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
          <linearGradient id={`gauge-grad-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color.stroke} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color.stroke} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Background arc */}
        <path
          d={describeArc(cx, cy, radius, 180, 360)}
          fill="none"
          stroke="var(--ax-border)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Glow layer */}
        <path
          d={describeArc(cx, cy, radius, 180, 180 + (score / 100) * 180)}
          fill="none"
          stroke={color.stroke}
          strokeWidth={strokeWidth + 6}
          strokeLinecap="round"
          filter={`url(#gauge-glow-${score})`}
          opacity="0.4"
        />

        {/* Progress arc */}
        <path
          d={describeArc(cx, cy, radius, 180, 180 + (score / 100) * 180)}
          fill="none"
          stroke={`url(#gauge-grad-${score})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />

        {/* Score text */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className={`${fontSize} font-bold`}
          fill={color.stroke}
        >
          {score}
        </text>

        {/* Label */}
        <text
          x={cx}
          y={cy + (size === 'sm' ? 14 : 18)}
          textAnchor="middle"
          className={`${labelSize} font-medium`}
          fill="rgba(var(--ax-text-rgb),0.45)"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

// Utility: SVG arc path
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}
