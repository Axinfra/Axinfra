'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Old URL kept alive as a redirect — the Overview tab was folded into the /vendor home screen. */
export default function VendorOverviewRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/vendor');
  }, [router]);
  return null;
}
