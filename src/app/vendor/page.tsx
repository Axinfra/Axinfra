'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VendorIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/vendor/overview');
  }, [router]);
  return null;
}
