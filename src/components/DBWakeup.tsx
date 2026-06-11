'use client';

import { useEffect } from 'react';

/**
 * Fires a silent keepalive ping to /api/keepalive as soon as the app mounts.
 * Neon free tier suspends the DB after ~5 min of inactivity. This wakes it
 * before the first real query so users don't see a 5-second cold-start delay.
 */
export default function DBWakeup() {
  useEffect(() => {
    fetch('/api/keepalive', { method: 'GET', cache: 'no-store' }).catch(() => {});
  }, []);
  return null;
}
