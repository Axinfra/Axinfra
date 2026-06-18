'use client';

import { useEffect, useState, useMemo } from 'react';

interface ProjectRole {
  role: string; createdAt: string;
  project: { id: string; name: string; status: string };
}
interface User {
  id: string; name: string; email: string; createdAt: string;
  preferredRole: string | null; googleId: string | null;
  projectRoles: ProjectRole[];
}
interface SignInLog {
  id: string;
  message: string;
  metadata: string | null;
  createdAt: string;
}

const ROLE_COLOR: Record<string, { bg: string; fg: string }> = {
  CLIENT:      { bg: 'rgba(var(--ax-accent-rgb),0.15)',  fg: 'var(--ax-accent)' },
  PMC:        { bg: 'rgba(96,165,250,0.15)',  fg: '#60a5fa' },
  VENDOR:     { bg: 'rgba(92,186,128,0.15)',  fg: '#5cba80' },
  CONSULTANT: { bg: 'rgba(167,139,250,0.15)', fg: '#a78bfa' },
  VIEWER:     { bg: 'rgba(232,228,220,0.08)', fg: 'rgba(var(--ax-text-rgb),0.5)' },
};

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLOR[role] ?? { bg: 'rgba(255,255,255,0.08)', fg: 'var(--ax-text)' };
  return (
    <span className="inline-block text-[10.5px] px-2 py-0.5 rounded-full font-bold" style={{ background: c.bg, color: c.fg }}>
      {role}
    </span>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ALL_ROLES = ['ALL', 'CLIENT', 'PMC', 'VENDOR', 'CONSULTANT', 'VIEWER'];

/* ─── Edit Drawer ───────────────────────────────────────────────────── */
interface EditDrawerProps {
  user: User;
  onClose: () => void;
  onSaved: (updatedUser: Partial<User> & { id: string }) => void;
}

function EditDrawer({ user, onClose, onSaved }: EditDrawerProps) {
  const [tab, setTab]                 = useState<'info' | 'activity'>('info');
  const [newEmail, setNewEmail]       = useState(user.email);
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPw, setSavingPw]       = useState(false);
  const [emailMsg, setEmailMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const [pwMsg, setPwMsg]             = useState<{ ok: boolean; text: string } | null>(null);
  const [activityLogs, setActivityLogs] = useState<SignInLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'activity') return;
    setActivityLoading(true);
    fetch(`/api/admin/users/${user.id}/activity`)
      .then(r => r.json())
      .then(d => { if (d.success) setActivityLogs(d.data.logs); })
      .finally(() => setActivityLoading(false));
  }, [tab, user.id]);

  async function saveEmail() {
    if (!newEmail.trim() || newEmail === user.email) return;
    setSavingEmail(true); setEmailMsg(null);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email', newEmail }),
    });
    const data = await res.json();
    setSavingEmail(false);
    if (data.success) {
      setEmailMsg({ ok: true, text: data.message });
      onSaved({ id: user.id, email: newEmail });
    } else {
      setEmailMsg({ ok: false, text: data.error });
    }
  }

  async function savePassword() {
    if (newPassword.length < 6) { setPwMsg({ ok: false, text: 'Minimum 6 characters' }); return; }
    setSavingPw(true); setPwMsg(null);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'password', newPassword }),
    });
    const data = await res.json();
    setSavingPw(false);
    if (data.success) {
      setPwMsg({ ok: true, text: data.message });
      setNewPassword('');
    } else {
      setPwMsg({ ok: false, text: data.error });
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Drawer — slides in from right */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[var(--ax-modal)] border-l border-[var(--ax-border)] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ax-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[rgba(var(--ax-accent-rgb),0.15)] border border-[rgba(var(--ax-accent-rgb),0.25)] flex items-center justify-center text-[14px] font-bold text-[var(--ax-accent)] shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-[15px] font-semibold text-[var(--ax-text)]">{user.name}</div>
              <div className="text-[12px] text-[rgba(var(--ax-text-rgb),0.45)]">User ID: {user.id.slice(0, 8)}…</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[rgba(var(--ax-text-rgb),0.4)] hover:text-[var(--ax-text)] hover:bg-[var(--ax-overlay-hover)] transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--ax-border)] px-5">
          {(['info', 'activity'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2.5 text-[12.5px] font-semibold capitalize transition-colors border-b-2 -mb-px"
              style={{
                borderColor: tab === t ? 'var(--ax-accent)' : 'transparent',
                color: tab === t ? 'var(--ax-accent)' : 'rgba(232,228,220,0.4)',
              }}>
              {t === 'activity' ? 'Sign-in Activity' : 'Account'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

        {tab === 'activity' && (
          <div>
            <div className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] font-semibold uppercase tracking-wide mb-3">Last 50 sign-ins</div>
            {activityLoading ? (
              <div className="text-center py-8 text-[rgba(var(--ax-text-rgb),0.3)] text-sm">Loading…</div>
            ) : activityLogs.length === 0 ? (
              <div className="text-center py-8 text-[rgba(var(--ax-text-rgb),0.25)] text-sm">No sign-in history yet</div>
            ) : (
              <div className="space-y-2">
                {activityLogs.map(log => {
                  let meta: { method?: string; role?: string; ip?: string } = {};
                  try { meta = JSON.parse(log.metadata ?? '{}'); } catch {}
                  const isGoogle = meta.method === 'google';
                  return (
                    <div key={log.id} className="bg-[var(--ax-overlay)] rounded-xl px-4 py-3 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {isGoogle ? (
                          <svg className="w-4 h-4 text-[#60a5fa]" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-[rgba(var(--ax-text-rgb),0.4)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12.5px] font-medium text-[var(--ax-text)]">
                            {isGoogle ? 'Google' : 'Credentials'}
                          </span>
                          {meta.role && <RoleBadge role={meta.role} />}
                        </div>
                        <div className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] mt-0.5">
                          {new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {meta.ip && meta.ip !== 'unknown' && <span className="ml-2 opacity-60">· {meta.ip}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'info' && <>
          {/* Info row */}
          <div className="bg-[var(--ax-overlay)] rounded-xl p-4 space-y-3">
            <div className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] font-semibold uppercase tracking-wide mb-2">Account Info</div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.5)]">Name</span>
              <span className="text-[13px] font-medium text-[var(--ax-text)]">{user.name}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.5)]">Current Email</span>
              <span className="text-[13px] font-medium text-[var(--ax-text)] break-all text-right">{user.email}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.5)]">Joined</span>
              <span className="text-[13px] text-[rgba(var(--ax-text-rgb),0.6)]">{fmt(user.createdAt)}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.5)]">Projects</span>
              <span className="text-[13px] text-[rgba(var(--ax-text-rgb),0.6)]">{user.projectRoles.length}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.5)]">Sign-in via</span>
              <span className="text-[12.5px] font-medium text-[var(--ax-text)]">
                {user.googleId ? '🔵 Google' : '🔑 Credentials'}
              </span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.5)]">Role</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {user.preferredRole
                  ? <RoleBadge role={user.preferredRole} />
                  : <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.25)]">None</span>}
              </div>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.5)]">Password</span>
              <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)] italic">Stored securely (bcrypt hash)</span>
            </div>
          </div>

          {/* Change Email */}
          <div className="bg-[var(--ax-overlay)] rounded-xl p-4">
            <div className="text-[13px] font-semibold text-[var(--ax-text)] mb-3">Change Email</div>
            <input
              type="email"
              value={newEmail}
              onChange={e => { setNewEmail(e.target.value); setEmailMsg(null); }}
              placeholder="new@email.com"
              className="w-full bg-[var(--ax-input)] border border-[var(--ax-border)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[var(--ax-text)] outline-none placeholder:text-[rgba(var(--ax-text-rgb),0.25)] mb-3 focus:border-[rgba(var(--ax-accent-rgb),0.4)]"
            />
            {emailMsg && (
              <div className={`text-[12.5px] mb-3 px-3 py-2 rounded-lg ${emailMsg.ok ? 'bg-[rgba(92,186,128,0.1)] text-[#5cba80]' : 'bg-[rgba(224,96,80,0.1)] text-[#e06050]'}`}>
                {emailMsg.ok ? '✓ ' : '✗ '}{emailMsg.text}
              </div>
            )}
            <button
              onClick={saveEmail}
              disabled={savingEmail || !newEmail.trim() || newEmail === user.email}
              className="w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
              {savingEmail ? 'Saving…' : 'Update Email'}
            </button>
          </div>

          {/* Reset Password */}
          <div className="bg-[var(--ax-overlay)] rounded-xl p-4">
            <div className="text-[13px] font-semibold text-[var(--ax-text)] mb-1">Set New Password</div>
            <p className="text-[11.5px] text-[rgba(var(--ax-text-rgb),0.4)] mb-3">
              Passwords are encrypted and cannot be viewed. Use this to set a new password for the user.
            </p>
            <div className="relative mb-3">
              <input
                type={showPw ? 'text' : 'password'}
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setPwMsg(null); }}
                placeholder="New password (min 6 chars)"
                className="w-full bg-[var(--ax-input)] border border-[var(--ax-border)] rounded-lg px-3.5 py-2.5 pr-10 text-[13.5px] text-[var(--ax-text)] outline-none placeholder:text-[rgba(var(--ax-text-rgb),0.25)] focus:border-[rgba(var(--ax-accent-rgb),0.4)]"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(var(--ax-text-rgb),0.35)] hover:text-[rgba(var(--ax-text-rgb),0.6)] transition-colors">
                {showPw ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </button>
            </div>
            {pwMsg && (
              <div className={`text-[12.5px] mb-3 px-3 py-2 rounded-lg ${pwMsg.ok ? 'bg-[rgba(92,186,128,0.1)] text-[#5cba80]' : 'bg-[rgba(224,96,80,0.1)] text-[#e06050]'}`}>
                {pwMsg.ok ? '✓ ' : '✗ '}{pwMsg.text}
              </div>
            )}
            <button
              onClick={savePassword}
              disabled={savingPw || newPassword.length < 6}
              className="w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(var(--ax-accent-rgb),0.15)', color: 'var(--ax-accent)', border: '1px solid rgba(var(--ax-accent-rgb),0.25)' }}>
              {savingPw ? 'Saving…' : 'Set New Password'}
            </button>
          </div>

          {/* Project assignments */}
          {user.projectRoles.length > 0 && (
            <div className="bg-[var(--ax-overlay)] rounded-xl p-4">
              <div className="text-[13px] font-semibold text-[var(--ax-text)] mb-3">Project Assignments</div>
              <div className="space-y-2">
                {user.projectRoles.map((pr, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--ax-border-subtle)] last:border-0">
                    <span className="text-[13px] text-[rgba(var(--ax-text-rgb),0.7)] truncate">{pr.project.name}</span>
                    <RoleBadge role={pr.role} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>}
        </div>
      </div>
    </>
  );
}

/* ─── Create User Modal ─────────────────────────────────────────────────── */
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: User) => void }) {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  async function submit() {
    if (!name.trim() || !email.trim() || password.length < 6) return;
    setSaving(true); setErr('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      onCreated(data.data.user);
      onClose();
    } else {
      setErr(data.error || 'Failed to create user');
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[var(--ax-modal)] border border-[var(--ax-border)] rounded-2xl shadow-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[16px] font-bold text-[var(--ax-text)]">Create New User</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[rgba(var(--ax-text-rgb),0.4)] hover:text-[var(--ax-text)] hover:bg-[var(--ax-overlay-hover)]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[11.5px] font-semibold text-[rgba(var(--ax-text-rgb),0.5)] uppercase tracking-wide mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full bg-[var(--ax-input)] border border-[var(--ax-border)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[var(--ax-text)] outline-none placeholder:text-[rgba(var(--ax-text-rgb),0.25)] focus:border-[rgba(var(--ax-accent-rgb),0.4)]"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-[rgba(var(--ax-text-rgb),0.5)] uppercase tracking-wide mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="rahul@example.com"
                className="w-full bg-[var(--ax-input)] border border-[var(--ax-border)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[var(--ax-text)] outline-none placeholder:text-[rgba(var(--ax-text-rgb),0.25)] focus:border-[rgba(var(--ax-accent-rgb),0.4)]"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-[rgba(var(--ax-text-rgb),0.5)] uppercase tracking-wide mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-[var(--ax-input)] border border-[var(--ax-border)] rounded-lg px-3.5 py-2.5 pr-10 text-[13.5px] text-[var(--ax-text)] outline-none placeholder:text-[rgba(var(--ax-text-rgb),0.25)] focus:border-[rgba(var(--ax-accent-rgb),0.4)]"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(var(--ax-text-rgb),0.35)] hover:text-[rgba(var(--ax-text-rgb),0.6)]">
                  {showPw
                    ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                </button>
              </div>
              <p className="text-[11px] text-[rgba(var(--ax-text-rgb),0.3)] mt-1.5">
                The user will receive a welcome email with these credentials.
              </p>
            </div>

            {err && (
              <div className="text-[12.5px] px-3 py-2 rounded-lg bg-[rgba(224,96,80,0.1)] text-[#e06050]">
                {err}
              </div>
            )}

            <div className="flex gap-2.5 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all"
                style={{ background: 'var(--ax-overlay)', color: 'rgba(var(--ax-text-rgb),0.6)', border: '1px solid var(--ax-border)' }}>
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving || !name.trim() || !email.trim() || password.length < 6}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--ax-accent)', color: '#0d0d11' }}>
                {saving ? 'Creating…' : 'Create & Send Email'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json())
      .then(d => { if (d.success) setUsers(d.data.users); else setError(d.error); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(updated: Partial<User> & { id: string }) {
    setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
    if (editingUser?.id === updated.id) setEditingUser(prev => prev ? { ...prev, ...updated } : prev);
  }

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== 'ALL') list = list.filter(u => u.projectRoles.some(r => r.role === roleFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list;
  }, [users, search, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, Set<string>> = {};
    users.forEach(u => u.projectRoles.forEach(r => {
      if (!counts[r.role]) counts[r.role] = new Set();
      counts[r.role].add(u.id);
    }));
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.size]));
  }, [users]);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-9 lg:py-8 max-w-[1400px]">

      {/* Edit Drawer */}
      {editingUser && (
        <EditDrawer
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Create User Modal */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(u) => setUsers(prev => [{ ...u, projectRoles: [] }, ...prev])}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--ax-text)]">Users</h1>
          <p className="text-[13px] text-[rgba(var(--ax-text-rgb),0.45)] mt-1">
            All platform accounts — click any user to view credentials and manage access
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
          style={{ background: 'var(--ax-accent)', color: '#0d0d11' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 mb-5">
        {[
          { label: 'Total', value: users.length, color: 'var(--ax-text)' },
          { label: 'Clients', value: roleCounts['CLIENT'] ?? 0, color: 'var(--ax-accent)' },
          { label: 'PMC', value: roleCounts['PMC'] ?? 0, color: '#60a5fa' },
          { label: 'Vendors', value: roleCounts['VENDOR'] ?? 0, color: '#5cba80' },
          { label: 'Consult', value: roleCounts['CONSULTANT'] ?? 0, color: '#a78bfa' },
          { label: 'Viewers', value: roleCounts['VIEWER'] ?? 0, color: 'rgba(var(--ax-text-rgb),0.4)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl px-3 py-3">
            <div className="text-[10px] text-[rgba(var(--ax-text-rgb),0.4)] font-semibold uppercase tracking-wide mb-1 truncate">{label}</div>
            <div className="text-xl sm:text-2xl font-bold" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="w-full sm:w-64 bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[var(--ax-text)] outline-none placeholder:text-[rgba(var(--ax-text-rgb),0.3)]"
        />
        <div className="flex gap-2 overflow-x-auto pb-1 flex-nowrap sm:flex-wrap">
          {ALL_ROLES.map(r => {
            const c = ROLE_COLOR[r];
            const active = roleFilter === r;
            return (
              <button key={r} onClick={() => setRoleFilter(r)}
                className="shrink-0 px-3 py-1.5 rounded-full text-[11.5px] font-semibold cursor-pointer transition-all whitespace-nowrap"
                style={{
                  background: active ? (c?.bg ?? 'rgba(var(--ax-accent-rgb),0.15)') : 'var(--ax-overlay)',
                  color: active ? (c?.fg ?? 'var(--ax-accent)') : 'rgba(var(--ax-text-rgb),0.5)',
                  border: active ? `1px solid ${c?.fg ?? 'var(--ax-accent)'}44` : '1px solid var(--ax-border)',
                }}>
                {r === 'ALL' ? `All (${users.length})` : `${r} (${roleCounts[r] ?? 0})`}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[rgba(var(--ax-text-rgb),0.4)] text-sm">Loading users…</div>
      ) : error ? (
        <div className="p-4 text-[#e06050] text-sm">{error}</div>
      ) : (
        <>
          <div className="text-[11.5px] text-[rgba(var(--ax-text-rgb),0.35)] mb-3">
            Showing {filtered.length} of {users.length} users · Click a row to manage credentials
          </div>

          {/* Mobile cards */}
          <div className="block sm:hidden space-y-3">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-[rgba(var(--ax-text-rgb),0.3)] text-sm">No users found</div>
            ) : filtered.map(u => {
              const uniqueRoles = Array.from(new Set(u.projectRoles.map(r => r.role)));
              return (
                <div key={u.id}
                  onClick={() => setEditingUser(u)}
                  className="bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl p-4 cursor-pointer hover:border-[rgba(var(--ax-accent-rgb),0.3)] transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-[rgba(var(--ax-accent-rgb),0.12)] border border-[rgba(var(--ax-accent-rgb),0.25)] flex items-center justify-center text-[13px] font-bold text-[var(--ax-accent)] shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-[var(--ax-text)] truncate">{u.name}</div>
                      <div className="text-[12px] text-[rgba(var(--ax-text-rgb),0.5)] truncate">{u.email}</div>
                    </div>
                    <svg className="w-4 h-4 text-[rgba(var(--ax-text-rgb),0.3)] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {uniqueRoles.length > 0
                      ? uniqueRoles.map(r => <RoleBadge key={r} role={r} />)
                      : u.preferredRole
                        ? <RoleBadge role={u.preferredRole} />
                        : null}
                  </div>
                  <div className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)]">
                    {u.projectRoles.length} project{u.projectRoles.length !== 1 ? 's' : ''} · Joined {fmt(u.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-[var(--ax-surface)] border border-[var(--ax-border)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[680px]">
                <thead>
                  <tr className="bg-[var(--ax-overlay)]">
                    {['User', 'Email', 'Roles', 'Projects', 'Joined', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10.5px] font-semibold text-[rgba(var(--ax-text-rgb),0.35)] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-[rgba(var(--ax-text-rgb),0.3)] text-sm">No users found</td></tr>
                  ) : filtered.map(u => {
                    const uniqueRoles = Array.from(new Set(u.projectRoles.map(r => r.role)));
                    return (
                      <tr key={u.id} className="border-t border-[var(--ax-border-subtle)] hover:bg-[var(--ax-overlay)] transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[rgba(var(--ax-accent-rgb),0.12)] border border-[rgba(var(--ax-accent-rgb),0.2)] flex items-center justify-center text-[12px] font-bold text-[var(--ax-accent)] shrink-0">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[13.5px] font-semibold text-[var(--ax-text)]">{u.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-[13px] text-[rgba(var(--ax-text-rgb),0.55)]">{u.email}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-1.5 flex-wrap items-center">
                            {uniqueRoles.length > 0
                              ? uniqueRoles.map(r => <RoleBadge key={r} role={r} />)
                              : u.preferredRole
                                ? <RoleBadge role={u.preferredRole} />
                                : <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.25)]">—</span>}
                            {u.googleId && (
                              <span className="text-[10px] text-[rgba(96,165,250,0.7)] font-medium">G</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {u.projectRoles.length === 0
                            ? <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.25)]">No projects</span>
                            : <div className="space-y-0.5">
                                {u.projectRoles.slice(0, 2).map((pr, i) => (
                                  <div key={i} className="flex items-center gap-1.5">
                                    <span className="text-[12.5px] text-[rgba(var(--ax-text-rgb),0.6)] truncate max-w-[130px]">{pr.project.name}</span>
                                    <RoleBadge role={pr.role} />
                                  </div>
                                ))}
                                {u.projectRoles.length > 2 && <span className="text-[11px] text-[rgba(var(--ax-text-rgb),0.3)]">+{u.projectRoles.length - 2} more</span>}
                              </div>}
                        </td>
                        <td className="px-4 py-3.5 text-[12px] text-[rgba(var(--ax-text-rgb),0.4)] whitespace-nowrap">{fmt(u.createdAt)}</td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => setEditingUser(u)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                            style={{ background: 'rgba(var(--ax-accent-rgb),0.1)', color: 'var(--ax-accent)', border: '1px solid rgba(var(--ax-accent-rgb),0.2)' }}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                            </svg>
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
