'use client';

import { ReactNode } from 'react';

interface OwnerOnlyProps {
  role: string;
  children: ReactNode;
}

/**
 * OwnerOnly — UI convenience wrapper that renders children only for OWNER role.
 * NOTE: This is UI-only. Real enforcement is always at the API layer.
 */
export default function OwnerOnly({ role, children }: OwnerOnlyProps) {
  if (role !== 'OWNER') return null;
  return <>{children}</>;
}
