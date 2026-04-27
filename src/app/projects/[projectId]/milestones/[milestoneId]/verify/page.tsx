'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface MilestoneData {
  id: string;
  title: string;
  plannedValue: number;
  value: number;
  isExtra: boolean;
  state: string;
  permissions: { canVerify?: boolean };
  boqLinks: Array<{
    plannedQty: number;
    boqItem: {
      description: string;
      unit: string;
      rate: number;
    };
  }>;
}

export default function VerifyMilestonePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const milestoneId = params.milestoneId as string;
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const [qtyVerified, setQtyVerified] = useState('');
  const [notes, setNotes] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const {
    data: milestone,
    isLoading: msLoading,
  } = useSWR<MilestoneData>(
    projectId && milestoneId
      ? `/api/projects/${projectId}/milestones/${milestoneId}`
      : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );
  const loading = projectLoading || msLoading;

  // Initialize default qtyVerified + run validation gates once milestone is loaded.
  useEffect(() => {
    if (!milestone || hydrated) return;
    const totalPlannedQty = milestone.boqLinks.reduce(
      (sum, link) => sum + link.plannedQty,
      0,
    );
    setQtyVerified(totalPlannedQty > 0 ? totalPlannedQty.toString() : '1');

    if (milestone.state !== 'SUBMITTED') {
      setError('Milestone must be in Submitted state to verify');
    } else if (!milestone.permissions?.canVerify) {
      setError('You do not have permission to verify milestones');
    }
    setHydrated(true);
  }, [milestone, hydrated]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError('');

    try {
      const res = await fetch(
        `/api/projects/${projectId}/milestones/${milestoneId}/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qtyVerified: parseFloat(qtyVerified),
            notes: notes || undefined,
          }),
        }
      );

      const data = await res.json();

      if (data.success) {
        router.push(`/projects/${projectId}/milestones/${milestoneId}`);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to verify milestone');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  if (!milestone) {
    return (
      <Layout>
        <div className="alert alert-error">Milestone not found</div>
      </Layout>
    );
  }

  // For Extras (no BOQ links), use the milestone's stored value directly
  const isExtra = milestone.isExtra || milestone.boqLinks.length === 0;
  const totalPlannedQty = milestone.boqLinks.reduce((sum, link) => sum + link.plannedQty, 0);
  const verifiedRatio = totalPlannedQty > 0 ? parseFloat(qtyVerified) / totalPlannedQty : 1;

  // Use stored value for Extras, otherwise calculate from BOQ
  const milestoneValue = isExtra ? milestone.value : milestone.plannedValue;
  const estimatedValue = isExtra ? milestoneValue : milestoneValue * Math.min(verifiedRatio, 1);

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-[#e8e4dc] mb-2">Verify Milestone</h1>
        <p className="text-[rgba(232,228,220,0.55)] mb-6">{milestone.title}</p>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Show BOQ table for BOQ-linked milestones, or Extra info */}
        {isExtra ? (
          <div className="card mb-6 bg-[rgba(196,163,90,0.08)] border-[rgba(196,163,90,0.15)]">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-orange-300">Extra (Outside BOQ)</h2>
            </div>
            <div className="card-body">
              <p className="text-[#c4a35a] mb-2">
                This milestone is outside the approved BOQ.
              </p>
              <div className="bg-[rgba(255,255,255,0.03)] rounded-lg p-4 border border-[rgba(196,163,90,0.15)]">
                <p className="text-sm text-[rgba(232,228,220,0.55)]">Milestone Value</p>
                <p className="text-2xl font-bold text-[#c4a35a]">{formatCurrency(milestone.value)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="card mb-6">
            <div className="card-header">
              <h2 className="text-lg font-semibold">BOQ Items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Unit</th>
                    <th className="text-right">Planned Qty</th>
                    <th className="text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {milestone.boqLinks.map((link, i) => (
                    <tr key={i}>
                      <td>{link.boqItem.description}</td>
                      <td>{link.boqItem.unit}</td>
                      <td className="text-right">{link.plannedQty}</td>
                      <td className="text-right">{formatCurrency(link.boqItem.rate)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[rgba(255,255,255,0.03)] font-semibold">
                    <td colSpan={2}>Total Planned</td>
                    <td className="text-right">{totalPlannedQty}</td>
                    <td className="text-right">{formatCurrency(milestone.plannedValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <div className="card">
          <form onSubmit={handleVerify} className="card-body space-y-6">
            {!isExtra && (
              <div>
                <label className="label">Verified Quantity *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={qtyVerified}
                  onChange={(e) => setQtyVerified(e.target.value)}
                  required
                />
                <p className="text-xs text-[rgba(232,228,220,0.55)] mt-1">
                  Enter the actual quantity verified (planned: {totalPlannedQty})
                </p>
              </div>
            )}

            <div className={`rounded-lg p-4 ${isExtra ? 'bg-[rgba(196,163,90,0.08)]' : 'bg-[rgba(255,255,255,0.03)]'}`}>
              <p className="text-sm text-[rgba(232,228,220,0.55)]">
                {isExtra ? 'Value to be Verified:' : 'Estimated Eligible Value:'}
              </p>
              <p className={`text-2xl font-bold ${isExtra ? 'text-[#c4a35a]' : 'text-[#5cba80]'}`}>
                {formatCurrency(estimatedValue)}
              </p>
              {!isExtra && (
                <p className="text-xs text-[rgba(232,228,220,0.55)] mt-1">
                  {(verifiedRatio * 100).toFixed(1)}% of planned value
                </p>
              )}
            </div>

            <div>
              <label className="label">Verification Notes</label>
              <textarea
                className="input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about the verification..."
              />
            </div>

            <div className="bg-[rgba(196,163,90,0.08)] border border-[rgba(196,163,90,0.15)] rounded-lg p-4">
              <p className="text-sm text-blue-300">
                <strong>Note:</strong> Verification will make this milestone eligible for payment
                and move it to Verified state.
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={verifying}
                className="btn btn-success"
              >
                {verifying ? 'Verifying...' : 'Verify Milestone'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
