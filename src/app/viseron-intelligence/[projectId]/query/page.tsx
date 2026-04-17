'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import ViseronNav from '@/components/viseron/ViseronNav';

interface ProjectInfo {
  name: string;
  myRole: string;
}

interface QueryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  details?: Record<string, unknown>[];
  confidence?: number;
  timestamp: string;
}

const SUGGESTED_QUERIES = [
  'What is project health?',
  'Which milestones are risky?',
  'Which vendor has lowest reliability?',
];

export default function ViseronQueryPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [messages, setMessages] = useState<QueryMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setProjectInfo({ name: data.data.name, myRole: data.data.myRole });
      })
      .finally(() => setPageLoading(false));
  }, [projectId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendQuery = useCallback(
    async (query: string) => {
      if (!query.trim() || isLoading) return;

      const userMsg: QueryMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: query.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);

      try {
        const res = await fetch(`/api/viseron-intelligence/${projectId}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim() }),
        });

        const data = await res.json();

        const assistantMsg: QueryMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.success ? data.data.summary : 'Something went wrong. Please try again.',
          type: data.success ? data.data.type : 'fallback',
          details: data.success ? data.data.details : [],
          confidence: data.success ? data.data.confidence : 0,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Network error. Please check your connection and try again.',
            type: 'fallback',
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [projectId, isLoading],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(input);
  };

  return (
    <Layout>
      <ViseronNav
        projectId={projectId}
        projectName={projectInfo?.name ?? '...'}
        role={projectInfo?.myRole ?? ''}
      />

      {pageLoading ? (
        <div className="h-96 rounded-xl bg-[rgba(255,255,255,0.05)] animate-pulse" />
      ) : (
        <div className="flex flex-col h-[calc(100vh-240px)] min-h-[400px] animate-fade-in">
          {/* Chat area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto scrollbar-thin px-1"
          >
            {messages.length === 0 ? (
              <EmptyState onQuerySelect={sendQuery} />
            ) : (
              <div className="space-y-4 py-4">
                {messages.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}

                {/* Typing indicator */}
                {isLoading && (
                  <div className="flex gap-3 animate-fade-in">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0 mt-0.5">
                      <ViseronMark className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl rounded-tl-sm px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-[rgba(255,255,255,0.07)] pt-4 pb-2">
            {/* Quick suggestions when chat has messages */}
            {messages.length > 0 && !isLoading && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {SUGGESTED_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendQuery(q)}
                    className="px-3 py-1.5 rounded-full bg-[rgba(255,255,255,0.05)] text-[11px] font-medium text-[rgba(232,228,220,0.55)] hover:bg-surface-200 hover:text-[#e8e4dc] transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your project... (e.g., Why is vendor X delayed?)"
                  className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3 pr-10 text-[13px] text-[#e8e4dc] placeholder:text-[rgba(232,228,220,0.35)] focus:border-[#c4a35a] focus:ring-4 focus:ring-[rgba(196,163,90,0.3)]/10 focus:outline-none transition-all"
                  disabled={isLoading}
                  autoFocus
                />
                {input.trim() && !isLoading && (
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-[#c4a35a] text-white flex items-center justify-center hover:bg-[#b3943f] transition-colors"
                  >
                    <SendIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </form>

            <p className="text-[10px] text-surface-300 mt-2 text-center">
              Viseron analyzes project data to answer your questions. Responses are based on current milestone and vendor data.
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ---- Chat Bubble ----

function ChatBubble({ message }: { message: QueryMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-[#c4a35a] text-white rounded-xl rounded-tr-sm px-4 py-2.5">
          <p className="text-[13px] leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0 mt-0.5">
        <ViseronMark className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="max-w-[85%]">
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl rounded-tl-sm px-4 py-3">
          <p className="text-[13px] text-[#e8e4dc] leading-relaxed">{message.content}</p>

          {/* Expandable details for vendor delay / risky milestones */}
          {message.details && message.details.length > 0 && message.type !== 'fallback' && (
            <DetailsPanel type={message.type} details={message.details} />
          )}
        </div>

        {/* Confidence indicator */}
        {message.confidence !== undefined && message.confidence > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 ml-1">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((dot) => (
                <span
                  key={dot}
                  className={`w-1 h-1 rounded-full ${
                    dot <= Math.round(message.confidence! * 5) ? 'bg-primary-400' : 'bg-surface-200'
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-[rgba(232,228,220,0.35)]">
              {Math.round((message.confidence ?? 0) * 100)}% confidence
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Details Panel ----

function DetailsPanel({ type, details }: { type?: string; details: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState(false);

  if (details.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[rgba(255,255,255,0.07)] pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] font-medium text-[#c4a35a] hover:text-[#c4a35a] transition-colors"
      >
        <ChevronIcon className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        {expanded ? 'Hide' : 'Show'} details ({details.length} item{details.length !== 1 ? 's' : ''})
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 animate-fade-in">
          {details.slice(0, 6).map((item, i) => (
            <div
              key={i}
              className="px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.03)] text-[12px]"
            >
              {type === 'vendor_delay' && (
                <>
                  <p className="font-medium text-[#e8e4dc]">{String(item.title ?? '')}</p>
                  <p className="text-[rgba(232,228,220,0.55)] mt-0.5">
                    {String(item.state ?? '').replace(/_/g, ' ')} &middot;{' '}
                    {Number(item.daysOverdue) > 0
                      ? `${item.daysOverdue} days overdue`
                      : 'On track'}
                  </p>
                  {Array.isArray(item.reasons) && item.reasons.length > 0 && (
                    <ul className="mt-1 text-[rgba(232,228,220,0.35)] list-disc list-inside">
                      {(item.reasons as string[]).map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {type === 'risky_milestones' && (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        item.riskLevel === 'critical'
                          ? 'bg-danger-500'
                          : item.riskLevel === 'high'
                            ? 'bg-warning-500'
                            : 'bg-primary-400'
                      }`}
                    />
                    <p className="font-medium text-[#e8e4dc]">{String(item.title ?? '')}</p>
                  </div>
                  <p className="text-[rgba(232,228,220,0.55)] mt-0.5">
                    {String(item.riskLevel ?? '')} risk &middot;{' '}
                    {item.vendorName ? String(item.vendorName) : 'No vendor'} &middot;{' '}
                    {Number(item.daysRemaining) < 0
                      ? `${Math.abs(Number(item.daysRemaining))}d overdue`
                      : `${item.daysRemaining}d remaining`}
                  </p>
                </>
              )}

              {type === 'vendor_reliability' && (
                <div className="flex items-center justify-between">
                  <p className="font-medium text-[#e8e4dc]">{String(item.vendorName ?? '')}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Number(item.reliability ?? 0)}%`,
                          background:
                            Number(item.reliability) >= 80
                              ? '#12B76A'
                              : Number(item.reliability) >= 60
                                ? '#F79009'
                                : '#F04438',
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-[#e8e4dc] tabular-nums">
                      {String(item.reliability ?? 0)}%
                    </span>
                  </div>
                </div>
              )}

              {type === 'project_health' && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Health', `${item.healthScore}/100 (${item.healthLabel})`],
                    ['Complete', `${item.completionPct}% (${item.verified}/${item.total})`],
                    ['Overdue', String(item.overdue ?? 0)],
                    ['Blocked', String(item.blocked ?? 0)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span className="text-[rgba(232,228,220,0.35)]">{label}: </span>
                      <span className="font-medium text-[#e8e4dc]">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Empty State ----

function EmptyState({ onQuerySelect }: { onQuerySelect: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-none shadow-primary-500/20 mb-5">
        <ViseronMark className="w-7 h-7 text-white" />
      </div>
      <h2 className="text-[18px] font-semibold text-[#e8e4dc] mb-1">Viseron Query Engine</h2>
      <p className="text-[13px] text-[rgba(232,228,220,0.55)] text-center max-w-sm mb-8">
        Ask questions about your project in plain English. Viseron will analyze your data and provide insights.
      </p>

      <div className="w-full max-w-md space-y-2">
        <p className="text-[11px] font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider text-center mb-3">
          Try asking
        </p>
        {[
          { query: 'What is project health?', icon: '◎' },
          { query: 'Which milestones are risky?', icon: '◆' },
          { query: 'Which vendor has lowest reliability?', icon: '▽' },
          { query: 'Why is vendor X delayed?', icon: '▹' },
        ].map((item) => (
          <button
            key={item.query}
            onClick={() => {
              if (item.query === 'Why is vendor X delayed?') return;
              onQuerySelect(item.query);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left group ${
              item.query === 'Why is vendor X delayed?'
                ? 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[rgba(232,228,220,0.35)] cursor-default'
                : 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] hover:border-[rgba(196,163,90,0.3)] hover:shadow-none'
            }`}
          >
            <span className={`text-sm ${item.query === 'Why is vendor X delayed?' ? 'text-surface-300' : 'text-primary-500'}`}>
              {item.icon}
            </span>
            <span className={`text-[13px] font-medium ${
              item.query === 'Why is vendor X delayed?'
                ? 'text-[rgba(232,228,220,0.35)]'
                : 'text-[#e8e4dc] group-hover:text-[#c4a35a]'
            }`}>
              {item.query}
            </span>
            {item.query === 'Why is vendor X delayed?' && (
              <span className="ml-auto text-[10px] text-surface-300 italic">Replace X with vendor name</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Icons ----

function ViseronMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M8 1L14.5 4.75V12.25L8 16L1.5 12.25V4.75L8 1Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8.5" r="2.5" fill="currentColor" fillOpacity="0.4" />
      <path d="M8 3.5V6M8 11V13.5M4 6.5L6 7.5M10 9.5L12 10.5M4 10.5L6 9.5M10 7.5L12 6.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
