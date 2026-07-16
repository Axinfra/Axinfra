'use client';

import { X } from 'lucide-react';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';

interface VendorProfile {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  contactPerson: string | null;
  mobile: string | null;
  gstNumber: string | null;
  address: string | null;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">{label}</p>
      <p className="text-sm text-[#e8e4dc] mt-0.5">{value?.trim() || '—'}</p>
    </div>
  );
}

export default function VendorProfileModal({
  projectId,
  userId,
  onClose,
}: {
  projectId: string;
  userId: string;
  onClose: () => void;
}) {
  const { data: vendor, isLoading } = useSWR<VendorProfile>(
    `/api/projects/${projectId}/vendors/${userId}/profile`,
    jsonFetcher,
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#e8e4dc]">Vendor Profile</h2>
            <button onClick={onClose} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {isLoading ? (
            <p className="text-sm text-[rgba(232,228,220,0.45)] py-6 text-center">Loading…</p>
          ) : !vendor ? (
            <p className="text-sm text-[#e06050] py-6 text-center">Vendor not found</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name" value={vendor.name} />
              <Field label="Company" value={vendor.companyName} />
              <Field label="Contact Person" value={vendor.contactPerson} />
              <Field label="Mobile" value={vendor.mobile} />
              <Field label="Email" value={vendor.email} />
              <Field label="GST Number" value={vendor.gstNumber} />
              <div className="col-span-2">
                <Field label="Address" value={vendor.address} />
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-[rgba(255,255,255,0.07)]">
            <button onClick={onClose} className="btn btn-secondary text-sm">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
