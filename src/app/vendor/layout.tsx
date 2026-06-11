import { VendorPortalProvider } from '@/lib/contexts/VendorPortalContext';

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <VendorPortalProvider>
      {children}
    </VendorPortalProvider>
  );
}
