'use client';

import { Calendar, TrendingUp } from 'lucide-react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import VendorTile from '@/components/vendor/VendorTile';

/** Reports hub — Gantt and Analytics are dense charts, useful to a literate office contact but
 * not action-oriented for the vendor themselves, so they're tucked one tap behind Home instead
 * of sitting as primary tabs. Internals of both pages are untouched. */
export default function VendorReportsPage() {
  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-7">
        <VendorNav title="Reports" backHref="/vendor" />
        <div className="grid grid-cols-2 gap-5">
          <VendorTile href="/vendor/gantt" icon={Calendar} label="Schedule" color="#3b82f6" />
          <VendorTile href="/vendor/analytics" icon={TrendingUp} label="Performance" color="#a78bfa" />
        </div>
      </div>
    </Layout>
  );
}
