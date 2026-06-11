'use client';

import { ReactNode } from 'react';

interface ClientOnlyProps {
  role: string;
  children: ReactNode;
}

/**
 * ClientOnly — UI convenience wrapper that renders children only for OWNER role.
 * NOTE: This is UI-only. Real enforcement is always at the API layer.
 */
export default function ClientOnly({ role, children }: ClientOnlyProps) {
  if (role !== 'CLIENT') return null;
  return <>{children}</>;
}
