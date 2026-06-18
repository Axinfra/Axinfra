'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';

interface Project {
  id: string;
  name: string;
  status: string;
  myRole: string;
}

const FEATURES = [
  {
    label: 'Health Gauge',
    desc: 'Real-time project scoring',
    Icon: HealthIcon,
  },
  {
    label: 'Risk Radar',
    desc: 'Milestone risk assessment',
    Icon: RiskIcon,
  },
  {
    label: 'Query Engine',
    desc: 'Ask in plain English',
    Icon: QueryIcon,
  },
];

export default function ViseronIntelligenceLandingPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setProjects(data.data);
          if (data.data.length === 1) {
            router.replace(`/viseron-intelligence/${data.data[0].id}/dashboard`);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-16 px-4">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-3">
            {/* Theme-aware icon */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(var(--ax-accent-rgb),0.12)',
                border: '1px solid rgba(var(--ax-accent-rgb),0.2)',
              }}
            >
              <ViseronIcon
                className="w-6 h-6"
                style={{ color: 'var(--ax-accent)' }}
              />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--ax-text)' }}>
                Viseron Intelligence
              </h1>
              <p
                className="text-[12px] font-semibold tracking-widest uppercase mt-0.5"
                style={{ color: 'var(--ax-accent)' }}
              >
                Project Health &middot; Risk &middot; Vendor Analytics
              </p>
            </div>
          </div>
          <p
            className="text-[15px] leading-relaxed mt-4"
            style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}
          >
            AI-powered project intelligence with natural language queries, health monitoring,
            vendor performance tracking, and risk assessment — all in one place.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          {FEATURES.map(({ label, desc, Icon }) => (
            <div
              key={label}
              className="rounded-xl p-4 text-center"
              style={{
                background: 'var(--ax-card)',
                border: '1px solid var(--ax-border)',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2"
                style={{ background: 'rgba(var(--ax-accent-rgb),0.1)' }}
              >
                <Icon className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
              </div>
              <p className="text-[12px] font-semibold" style={{ color: 'var(--ax-text)' }}>{label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* Project list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl animate-pulse"
                style={{ background: 'var(--ax-overlay-hover)' }}
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div
            className="text-center py-12 text-sm"
            style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}
          >
            No projects found. Create a project first.
          </div>
        ) : (
          <div className="space-y-2">
            <p
              className="text-[12px] font-medium uppercase tracking-wider mb-3"
              style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}
            >
              Select a project
            </p>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/viseron-intelligence/${p.id}/dashboard`)}
                className="w-full flex items-center justify-between px-5 py-4 rounded-xl transition-all group text-left"
                style={{
                  background: 'var(--ax-card)',
                  border: '1px solid var(--ax-border)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(var(--ax-accent-rgb),0.35)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ax-border)';
                }}
              >
                <div>
                  <p
                    className="text-[14px] font-medium transition-colors"
                    style={{ color: 'var(--ax-text)' }}
                  >
                    {p.name}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>
                    {p.myRole} &middot; {p.status}
                  </p>
                </div>
                <ChevronRightIcon
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

/* ── Icons ── */

function ViseronIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 20 20" fill="none">
      <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z"
        fill="currentColor" fillOpacity="0.15"
        stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10" cy="10" r="3" fill="currentColor" fillOpacity="0.5" />
      <path d="M10 4V7M10 13V16M5 7L7.5 8.5M12.5 11.5L15 13M5 13L7.5 11.5M12.5 8.5L15 7"
        stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

function HealthIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function RiskIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function QueryIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}

function ChevronRightIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
