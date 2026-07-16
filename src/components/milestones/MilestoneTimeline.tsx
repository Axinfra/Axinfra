'use client';

import { Paperclip, CheckCircle2, MessageCircle, Undo2, ArrowRightCircle, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/utils';

const ROLE_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'secondary'> = {
  CLIENT: 'default',
  PMC: 'warning',
  VENDOR: 'success',
  CONSULTANT: 'secondary',
};

const STATE_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  VERIFIED: 'Verified',
  CLOSED: 'Closed',
};

export interface TimelineFile {
  id: string;
  fileName: string;
  mimeType: string;
}

export interface TimelineSubmission {
  id: string;
  qtyOrPercent: number;
  remarks?: string | null;
  submittedAt: string;
  submittedBy: { name: string };
  files: TimelineFile[];
  /** 'PMC' = a progress update (qtyOrPercent is the new percentComplete); 'VENDOR' = a
   * supporting document/photo attachment with no progress change. Null on legacy rows from
   * before this distinction existed — rendered the same as a Vendor entry. */
  authorRole?: string | null;
}

export interface TimelineVerification {
  id: string;
  verifiedAt: string;
  notes?: string | null;
  qtyVerified: number;
  valueEligibleComputed: number;
  verifiedBy: { name: string };
}

export interface TimelineComment {
  id: string;
  body: string;
  role: string;
  createdAt: string;
  author: { name: string };
}

export interface TimelineTransition {
  fromState: string | null;
  toState: string;
  createdAt: string;
  reason?: string | null;
  role: string;
  actor: { name: string };
}

interface MilestoneTimelineProps {
  submissions: TimelineSubmission[];
  verifications: TimelineVerification[];
  comments: TimelineComment[];
  transitions: TimelineTransition[];
}

type Event =
  | { kind: 'submission'; at: string; data: TimelineSubmission }
  | { kind: 'verification'; at: string; data: TimelineVerification }
  | { kind: 'comment'; at: string; data: TimelineComment }
  | { kind: 'transition'; at: string; data: TimelineTransition };

export function FileChip({ file }: { file: TimelineFile }) {
  const isImage = file.mimeType.startsWith('image/');
  const url = `/api/files/${file.id}`;
  return isImage ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={file.fileName}
        className="w-full h-20 object-cover rounded-md border border-[rgba(255,255,255,0.08)] group-hover:opacity-80 transition-opacity"
      />
      <p className="text-[10px] text-[rgba(232,228,220,0.45)] mt-1 truncate">{file.fileName}</p>
    </a>
  ) : (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-[rgba(255,255,255,0.08)] hover:border-[rgba(var(--ax-accent-rgb),0.4)] transition-colors"
    >
      <FileText className="w-3.5 h-3.5 text-[var(--ax-accent)] shrink-0" />
      <span className="text-xs text-[var(--ax-accent)] truncate">{file.fileName}</span>
    </a>
  );
}

/** Complete milestone audit trail — submissions, verifications, comments, and state changes merged into one chronological timeline. */
export default function MilestoneTimeline({ submissions, verifications, comments, transitions }: MilestoneTimelineProps) {
  const events: Event[] = [
    ...submissions.map((s): Event => ({ kind: 'submission', at: s.submittedAt, data: s })),
    ...verifications.map((v): Event => ({ kind: 'verification', at: v.verifiedAt, data: v })),
    ...comments.map((c): Event => ({ kind: 'comment', at: c.createdAt, data: c })),
    // Transitions to VERIFIED are already represented by the richer verification event above.
    ...transitions
      .filter((t) => t.toState !== 'VERIFIED')
      .map((t): Event => ({ kind: 'transition', at: t.createdAt, data: t })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (events.length === 0) {
    return <p className="text-sm text-[rgba(232,228,220,0.4)] text-center py-6">No activity yet.</p>;
  }

  return (
    <div>
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        return (
          <div key={`${event.kind}-${i}`} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-[rgba(255,255,255,0.08)]" />
            )}

            {event.kind === 'submission' && (() => {
              const isPmc = event.data.authorRole === 'PMC';
              return (
                <>
                  <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isPmc ? 'bg-[rgba(92,186,128,0.15)] text-[#5cba80]' : 'bg-[rgba(var(--ax-accent-rgb),0.12)] text-[var(--ax-accent)]'
                  }`}>
                    {isPmc ? <CheckCircle2 className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#e8e4dc]">{event.data.submittedBy.name}</span>
                      <Badge variant={isPmc ? 'warning' : 'success'} className="text-[10px] px-1.5 py-0">{isPmc ? 'PMC' : 'Vendor'}</Badge>
                      <span className={`text-xs ${isPmc ? 'text-[#5cba80] font-medium' : 'text-[rgba(232,228,220,0.4)]'}`}>
                        {isPmc ? `updated progress to ${event.data.qtyOrPercent}%` : 'attached documents'}
                      </span>
                      <span className="text-xs text-[rgba(232,228,220,0.3)]">· {formatDateTime(event.data.submittedAt)}</span>
                    </div>
                    {event.data.remarks && (
                      <p className="text-sm text-[rgba(232,228,220,0.75)] mt-1.5 whitespace-pre-wrap">{event.data.remarks}</p>
                    )}
                    {event.data.files.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                        {event.data.files.map((f) => <FileChip key={f.id} file={f} />)}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {event.kind === 'verification' && (
              <>
                <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[rgba(92,186,128,0.15)] text-[#5cba80]">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#e8e4dc]">{event.data.verifiedBy.name}</span>
                    <Badge variant="warning" className="text-[10px] px-1.5 py-0">PMC</Badge>
                    <span className="text-xs text-[#5cba80] font-medium">verified this activity</span>
                    <span className="text-xs text-[rgba(232,228,220,0.3)]">· {formatDateTime(event.data.verifiedAt)}</span>
                  </div>
                  <p className="text-xs text-[#5cba80] mt-1">
                    Eligible value: {formatCurrency(event.data.valueEligibleComputed)}
                  </p>
                  {event.data.notes && (
                    <p className="text-sm text-[rgba(232,228,220,0.75)] mt-1 whitespace-pre-wrap">{event.data.notes}</p>
                  )}
                </div>
              </>
            )}

            {event.kind === 'comment' && (() => {
              const isChangeRequest = event.data.body.startsWith('Changes requested');
              return (
                <>
                  <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isChangeRequest ? 'bg-[rgba(224,96,80,0.15)] text-[#e06050]' : 'bg-[rgba(255,255,255,0.06)] text-[#e8e4dc]'
                  }`}>
                    {isChangeRequest ? <Undo2 className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#e8e4dc]">{event.data.author.name}</span>
                      <Badge variant={ROLE_BADGE_VARIANT[event.data.role] ?? 'secondary'} className="text-[10px] px-1.5 py-0">{event.data.role}</Badge>
                      {isChangeRequest && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Changes Requested</Badge>}
                      <span className="text-xs text-[rgba(232,228,220,0.3)]">· {formatDateTime(event.data.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[rgba(232,228,220,0.75)] mt-1 whitespace-pre-wrap">
                      {isChangeRequest ? event.data.body.replace(/^Changes requested — /, '') : event.data.body}
                    </p>
                  </div>
                </>
              );
            })()}

            {event.kind === 'transition' && (
              <>
                <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.5)]">
                  <ArrowRightCircle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#e8e4dc]">{event.data.actor.name}</span>
                    <Badge variant={ROLE_BADGE_VARIANT[event.data.role] ?? 'secondary'} className="text-[10px] px-1.5 py-0">{event.data.role}</Badge>
                    <span className="text-xs text-[rgba(232,228,220,0.45)]">
                      moved this activity to <span className="font-medium text-[rgba(232,228,220,0.7)]">{STATE_LABEL[event.data.toState] ?? event.data.toState}</span>
                    </span>
                    <span className="text-xs text-[rgba(232,228,220,0.3)]">· {formatDateTime(event.data.createdAt)}</span>
                  </div>
                  {event.data.reason && (
                    <p className="text-xs text-[rgba(232,228,220,0.45)] mt-1 italic">&ldquo;{event.data.reason}&rdquo;</p>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
