'use client';

import { SWRConfig } from 'swr';
import { jsonFetcher } from '@/lib/fetcher';

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: jsonFetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 3_000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
