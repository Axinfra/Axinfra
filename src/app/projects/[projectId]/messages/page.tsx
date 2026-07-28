'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Paperclip, Send, Download, MessageCircle, X, Users } from 'lucide-react';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDateTime } from '@/lib/utils';

interface Conversation {
  userId: string;
  name: string;
  role: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface MessageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

interface ThreadMessage {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; name: string };
  attachments: MessageAttachment[];
  pending?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Client', PMC: 'PMC', VENDOR: 'Vendor', CONSULTANT: 'Consultant',
  SITE_ENGINEER: 'Site Engineer', VIEWER: 'Viewer',
};

async function postMessage(
  projectId: string,
  recipientId: string,
  body: string,
  file: File | null,
): Promise<{ success: boolean; error?: string; data?: ThreadMessage }> {
  if (file) {
    const formData = new FormData();
    formData.append('body', body);
    formData.append('file', file);
    const res = await fetch(`/api/projects/${projectId}/messages/${recipientId}`, { method: 'POST', body: formData });
    return res.json();
  }
  const res = await fetch(`/api/projects/${projectId}/messages/${recipientId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  return res.json();
}

export default function MessagesPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const myUserId = (project?.myUserId as string) ?? '';

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Multi-recipient ("broadcast") mode — checking any contact switches the right panel from a
  // single thread into a composer that fires the same text/attachment as separate 1:1 messages
  // to everyone checked (one-on-one only under the hood, per how DMs are modeled — there's no
  // shared group thread).
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [broadcastDraft, setBroadcastDraft] = useState('');
  const [broadcastFile, setBroadcastFile] = useState<File | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState('');
  const [broadcastSuccess, setBroadcastSuccess] = useState('');

  const { data: conversationsResp, mutate: refetchConversations } = useSWR<Conversation[]>(
    projectId ? `/api/projects/${projectId}/messages/conversations` : null,
    jsonFetcher,
    { refreshInterval: 15_000 },
  );
  const conversations = conversationsResp ?? [];

  useEffect(() => {
    if (!selectedUserId && conversations.length > 0) {
      setSelectedUserId(conversations[0].userId);
    }
  }, [conversations, selectedUserId]);

  const { data: threadResp, mutate: mutateThread } = useSWR<ThreadMessage[]>(
    projectId && selectedUserId ? `/api/projects/${projectId}/messages/${selectedUserId}` : null,
    jsonFetcher,
    { refreshInterval: 5_000, onSuccess: () => void refetchConversations() },
  );
  const thread = threadResp ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length]);

  const selected = conversations.find((c) => c.userId === selectedUserId) ?? null;

  const toggleChecked = (userId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    setBroadcastSuccess('');
  };

  // Optimistic send — the bubble appears immediately (before the network round trip) so
  // sending feels instant; reconciled with the server's real record right after, and rolled
  // back if the request actually fails.
  const handleSend = async () => {
    if (!selectedUserId || (!draft.trim() && !draftFile)) return;
    const body = draft.trim();
    const file = draftFile;
    const recipientId = selectedUserId;

    setDraft('');
    setDraftFile(null);
    setError('');

    const optimistic: ThreadMessage = {
      id: `pending-${Date.now()}`,
      body,
      createdAt: new Date().toISOString(),
      senderId: myUserId,
      sender: { id: myUserId, name: 'You' },
      attachments: file ? [{ id: 'pending-file', fileName: file.name, mimeType: file.type, fileSize: file.size }] : [],
      pending: true,
    };
    void mutateThread((current) => [...(current ?? []), optimistic], { revalidate: false });

    const result = await postMessage(projectId, recipientId, body, file);
    if (result.success) {
      void mutateThread();
      void refetchConversations();
    } else {
      setError(result.error ?? 'Failed to send message');
      void mutateThread((current) => (current ?? []).filter((m) => m.id !== optimistic.id), { revalidate: false });
    }
  };

  const handleBroadcastSend = async () => {
    if (checkedIds.size === 0 || (!broadcastDraft.trim() && !broadcastFile)) return;
    setBroadcasting(true);
    setBroadcastError('');
    setBroadcastSuccess('');
    const body = broadcastDraft.trim();
    const file = broadcastFile;
    const recipients = Array.from(checkedIds);

    try {
      const results = await Promise.all(recipients.map((recipientId) => postMessage(projectId, recipientId, body, file)));
      const failedCount = results.filter((r) => !r.success).length;

      if (failedCount === 0) {
        setBroadcastSuccess(`Sent to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}.`);
        setBroadcastDraft('');
        setBroadcastFile(null);
        setCheckedIds(new Set());
      } else {
        setBroadcastError(`Sent to ${recipients.length - failedCount} of ${recipients.length} — some failed. Try again for the rest.`);
      }
      void refetchConversations();
      if (selectedUserId && recipients.includes(selectedUserId)) void mutateThread();
    } catch {
      setBroadcastError('Failed to send message');
    } finally {
      setBroadcasting(false);
    }
  };

  if (projectLoading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="card overflow-hidden" style={{ height: '70vh' }}>
        <div className="flex h-full">
          {/* Contact list */}
          <div className="w-72 shrink-0 border-r border-[rgba(255,255,255,0.07)] overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-[rgba(232,228,220,0.35)]">No other project members yet.</div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.userId}
                  className={`w-full flex items-start gap-2.5 px-3 py-3 border-b border-[rgba(255,255,255,0.04)] transition-colors ${
                    selectedUserId === c.userId && checkedIds.size === 0 ? 'bg-[rgba(255,255,255,0.05)]' : 'hover:bg-[rgba(255,255,255,0.02)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checkedIds.has(c.userId)}
                    onChange={() => toggleChecked(c.userId)}
                    className="mt-1 shrink-0 cursor-pointer accent-[var(--ax-accent)]"
                    aria-label={`Select ${c.name} for a group message`}
                  />
                  <button onClick={() => setSelectedUserId(c.userId)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-[#e8e4dc] truncate">{c.name}</p>
                      {c.unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold text-white bg-[#e06050] leading-none shrink-0">
                          {c.unreadCount > 99 ? '99+' : c.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[rgba(232,228,220,0.4)] uppercase tracking-wider mt-0.5">{ROLE_LABELS[c.role] ?? c.role}</p>
                    {c.lastMessageBody && (
                      <p className="text-xs text-[rgba(232,228,220,0.5)] truncate mt-1">{c.lastMessageBody}</p>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Right panel: broadcast composer (if anyone's checked) or the selected thread */}
          <div className="flex-1 flex flex-col min-w-0">
            {checkedIds.size > 0 ? (
              <>
                <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.07)]">
                  <p className="text-sm font-semibold text-[#e8e4dc] inline-flex items-center gap-1.5">
                    <Users className="w-4 h-4" /> New message to {checkedIds.size} {checkedIds.size === 1 ? 'person' : 'people'}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Array.from(checkedIds).map((id) => {
                      const c = conversations.find((x) => x.userId === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 text-[11px] pl-2.5 pr-1.5 py-1 rounded-full bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.75)]">
                          {c?.name ?? 'Unknown'}
                          <button onClick={() => toggleChecked(id)} className="hover:text-white p-0.5" aria-label={`Remove ${c?.name ?? 'recipient'}`}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 flex items-center justify-center text-sm text-[rgba(232,228,220,0.3)] text-center px-8">
                  Sent as a separate message to each person selected above.
                </div>

                {broadcastError && <div className="px-5 pb-2"><div className="alert alert-error text-xs">{broadcastError}</div></div>}
                {broadcastSuccess && <div className="px-5 pb-2"><div className="alert alert-success text-xs">{broadcastSuccess}</div></div>}

                <div className="p-3 border-t border-[rgba(255,255,255,0.07)] flex items-end gap-2">
                  <label className="btn btn-secondary btn-sm cursor-pointer shrink-0" title="Attach a file">
                    <Paperclip className="w-4 h-4" />
                    <input type="file" className="hidden" onChange={(e) => setBroadcastFile(e.target.files?.[0] ?? null)} />
                  </label>
                  <textarea
                    rows={1}
                    className="input text-sm resize-none flex-1"
                    placeholder={broadcastFile ? broadcastFile.name : `Message to ${checkedIds.size} ${checkedIds.size === 1 ? 'person' : 'people'}…`}
                    value={broadcastDraft}
                    onChange={(e) => setBroadcastDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleBroadcastSend();
                      }
                    }}
                  />
                  <button
                    onClick={() => void handleBroadcastSend()}
                    disabled={broadcasting || (!broadcastDraft.trim() && !broadcastFile)}
                    className="btn btn-primary btn-sm shrink-0 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : !selected ? (
              <div className="flex-1 flex items-center justify-center text-sm text-[rgba(232,228,220,0.35)]">
                <div className="text-center">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2 text-[rgba(232,228,220,0.15)]" />
                  Select someone to message, or check multiple people to message them all at once
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.07)]">
                  <p className="text-sm font-semibold text-[#e8e4dc]">{selected.name}</p>
                  <p className="text-[11px] text-[rgba(232,228,220,0.4)] uppercase tracking-wider">{ROLE_LABELS[selected.role] ?? selected.role}</p>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {thread.length === 0 ? (
                    <p className="text-sm text-[rgba(232,228,220,0.35)] text-center mt-6">No messages yet — say hello.</p>
                  ) : (
                    thread.map((m) => {
                      const isMine = m.senderId === myUserId;
                      return (
                        <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[70%] rounded-xl px-3.5 py-2.5 ${
                              isMine ? 'bg-[var(--ax-accent)] text-black' : 'bg-[rgba(255,255,255,0.06)] text-[#e8e4dc]'
                            } ${m.pending ? 'opacity-60' : ''}`}
                          >
                            {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                            {m.attachments.map((a) => (
                              <a
                                key={a.id}
                                href={`/api/projects/${projectId}/messages/attachments/${a.id}?download=1`}
                                className={`mt-1.5 flex items-center gap-1.5 text-xs underline ${isMine ? 'text-black/70' : 'text-[rgba(232,228,220,0.7)]'}`}
                              >
                                <Download className="w-3.5 h-3.5" /> {a.fileName}
                              </a>
                            ))}
                            <p className={`text-[10px] mt-1 ${isMine ? 'text-black/50' : 'text-[rgba(232,228,220,0.35)]'}`}>
                              {m.pending ? 'Sending…' : formatDateTime(m.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {error && <div className="px-5"><div className="alert alert-error text-xs">{error}</div></div>}

                <div className="p-3 border-t border-[rgba(255,255,255,0.07)] flex items-end gap-2">
                  <label className="btn btn-secondary btn-sm cursor-pointer shrink-0" title="Attach a file">
                    <Paperclip className="w-4 h-4" />
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setDraftFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <textarea
                    rows={1}
                    className="input text-sm resize-none flex-1"
                    placeholder={draftFile ? draftFile.name : 'Type a message…'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={!draft.trim() && !draftFile}
                    className="btn btn-primary btn-sm shrink-0 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
