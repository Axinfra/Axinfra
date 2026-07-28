'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Mail, MessageCircle, X } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';

interface Conversation {
  userId: string;
  name: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Client', PMC: 'PMC', VENDOR: 'Vendor', CONSULTANT: 'Consultant',
  SITE_ENGINEER: 'Site Engineer', VIEWER: 'Viewer',
};

/** Share-via-email-or-internal-message modal, reused for Documents and Checklists — both just
 * point `shareUrl` at their own `.../share` route, which resolves what file to attach server-side. */
export default function ShareModal({
  projectId,
  shareUrl,
  itemLabel,
  onClose,
}: {
  projectId: string;
  shareUrl: string;
  itemLabel: string;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<'EMAIL' | 'MESSAGE'>('EMAIL');
  const [emailsInput, setEmailsInput] = useState('');
  const [recipientIds, setRecipientIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: conversationsResp } = useSWR<Conversation[]>(
    method === 'MESSAGE' && projectId ? `/api/projects/${projectId}/messages/conversations` : null,
    jsonFetcher,
  );
  const conversations = conversationsResp ?? [];

  const toggleRecipient = (userId: string) => {
    setRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const emails = emailsInput.split(/[,\n]/).map((e) => e.trim()).filter(Boolean);
  const canSend = method === 'EMAIL' ? emails.length > 0 : recipientIds.size > 0;

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch(shareUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          method === 'EMAIL'
            ? { method: 'EMAIL', emails, note: note.trim() || undefined }
            : { method: 'MESSAGE', recipientIds: Array.from(recipientIds), note: note.trim() || undefined },
        ),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error ?? 'Failed to share');
      }
    } catch {
      setError('Failed to share');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-md border max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--ax-border)' }}>
          <h2 className="text-base font-semibold truncate pr-2" style={{ color: 'var(--ax-text)' }}>Share &ldquo;{itemLabel}&rdquo;</h2>
          <button onClick={onClose} className="p-1 rounded-lg ax-hover-overlay shrink-0" style={{ color: 'rgba(var(--ax-text-rgb), 0.4)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center space-y-3">
            <div className="alert alert-success text-sm">
              {method === 'EMAIL' ? `Emailed to ${emails.length} address${emails.length > 1 ? 'es' : ''}.` : `Sent to ${recipientIds.size} ${recipientIds.size === 1 ? 'person' : 'people'}.`}
            </div>
            <button onClick={onClose} className="btn btn-secondary">Close</button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex gap-2 p-1 rounded-lg bg-[rgba(255,255,255,0.04)] w-fit">
              <button
                onClick={() => setMethod('EMAIL')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${method === 'EMAIL' ? 'bg-[var(--ax-accent)] text-black font-medium' : 'text-[rgba(232,228,220,0.6)]'}`}
              >
                <Mail className="w-3.5 h-3.5" /> Email
              </button>
              <button
                onClick={() => setMethod('MESSAGE')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${method === 'MESSAGE' ? 'bg-[var(--ax-accent)] text-black font-medium' : 'text-[rgba(232,228,220,0.6)]'}`}
              >
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </button>
            </div>

            {error && <div className="alert alert-error text-sm">{error}</div>}

            {method === 'EMAIL' ? (
              <div>
                <label className="label">Recipient email(s)</label>
                <textarea
                  rows={2}
                  className="input text-sm resize-none"
                  placeholder="one@example.com, another@example.com"
                  value={emailsInput}
                  onChange={(e) => setEmailsInput(e.target.value)}
                />
                <p className="text-xs mt-1" style={{ color: 'rgba(232,228,220,0.35)' }}>Separate multiple addresses with a comma.</p>
              </div>
            ) : (
              <div>
                <label className="label">Send to</label>
                {conversations.length === 0 ? (
                  <p className="text-sm py-2" style={{ color: 'rgba(232,228,220,0.4)' }}>No other project members yet.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--ax-border)' }}>
                    {conversations.map((c) => (
                      <label
                        key={c.userId}
                        className="flex items-center gap-2.5 px-3 py-2 border-b last:border-b-0 cursor-pointer hover:bg-[rgba(255,255,255,0.02)]"
                        style={{ borderColor: 'var(--ax-border-subtle)' }}
                      >
                        <input
                          type="checkbox"
                          checked={recipientIds.has(c.userId)}
                          onChange={() => toggleRecipient(c.userId)}
                          className="accent-[var(--ax-accent)]"
                        />
                        <span className="text-sm" style={{ color: 'var(--ax-text)' }}>{c.name}</span>
                        <span className="text-[10px] uppercase tracking-wider ml-auto" style={{ color: 'rgba(232,228,220,0.35)' }}>{ROLE_LABELS[c.role] ?? c.role}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="label">Note (optional)</label>
              <textarea rows={2} className="input text-sm resize-none" placeholder="e.g. Latest revision, please review." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button onClick={onClose} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void handleSend()} disabled={!canSend || sending} className="btn btn-primary disabled:opacity-50">
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
