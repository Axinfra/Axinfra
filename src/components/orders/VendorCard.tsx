'use client';

import { useState } from 'react';
import AssignVendorModal from './AssignVendorModal';
import VendorProfileModal from './VendorProfileModal';

interface VendorInfo {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  contactPerson: string | null;
  mobile: string | null;
  gstNumber: string | null;
  address: string | null;
}

interface OrderForVendorAssign {
  id: string;
  vendorUserId: string | null;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-[rgba(232,228,220,0.45)] shrink-0">{label}</span>
      <span className="text-[#e8e4dc] text-right truncate">{value?.trim() || '—'}</span>
    </div>
  );
}

/** Vendor assignment card for a Purchase Order — shows the assigned vendor's contact/company
 * details, or an empty state with an Assign Vendor action when none is set. */
export default function VendorCard({
  projectId,
  order,
  vendor,
  canEdit,
  onChanged,
}: {
  projectId: string;
  order: OrderForVendorAssign;
  vendor: VendorInfo | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  return (
    <div className="card">
      <div className="card-header flex justify-between items-center">
        <h2 className="text-lg font-semibold">Vendor</h2>
        {canEdit && (
          <button onClick={() => setShowEdit(true)} className="btn btn-sm btn-secondary text-xs">
            {vendor ? 'Change Vendor' : 'Assign Vendor'}
          </button>
        )}
      </div>
      <div className="card-body">
        {!vendor ? (
          <div className="py-6 text-center">
            <p className="text-sm text-[rgba(232,228,220,0.55)]">No Vendor Assigned</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              <Row label="Name" value={vendor.name} />
              <Row label="Company" value={vendor.companyName} />
              <Row label="Contact Person" value={vendor.contactPerson} />
              <Row label="Mobile" value={vendor.mobile} />
              <Row label="Email" value={vendor.email} />
              <Row label="GST Number" value={vendor.gstNumber} />
            </div>
            {vendor.address && (
              <div className="pt-2 border-t border-[rgba(255,255,255,0.06)]">
                <Row label="Address" value={vendor.address} />
              </div>
            )}
            <div className="pt-2">
              <button onClick={() => setShowProfile(true)} className="btn btn-sm btn-secondary text-xs">
                View Vendor Profile
              </button>
            </div>
          </div>
        )}
      </div>

      {showEdit && (
        <AssignVendorModal
          projectId={projectId}
          orderId={order.id}
          currentVendorUserId={order.vendorUserId}
          onClose={() => setShowEdit(false)}
          onSaved={onChanged}
        />
      )}
      {showProfile && vendor && (
        <VendorProfileModal projectId={projectId} userId={vendor.id} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
}
