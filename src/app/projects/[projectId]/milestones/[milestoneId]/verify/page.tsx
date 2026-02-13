'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency } from '@/lib/utils';

interface MilestoneData {
  id: string;
  title: string;
  plannedValue: number;
  value: number;
  isExtra: boolean;
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
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [milestone, setMilestone] = useState<MilestoneData | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const [qtyVerified, setQtyVerified] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, [projectId, milestoneId]);

  const loadData = async () => {
    try {
      const [projectRes, milestoneRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/milestones/${milestoneId}`),
      ]);

      const [projectData, milestoneData] = await Promise.all([
        projectRes.json(),
        milestoneRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
      }

      if (milestoneData.success) {
        setMilestone(milestoneData.data);

        // Set default qty to total planned (or 1 for Extras with no BOQ)
        const totalPlannedQty = milestoneData.data.boqLinks.reduce(
          (sum: number, link: { plannedQty: number }) => sum + link.plannedQty,
          0
        );
        // For Extras (no BOQ), default to 1 (100% verification)
        setQtyVerified(totalPlannedQty > 0 ? totalPlannedQty.toString() : '1');

        if (milestoneData.data.state !== 'SUBMITTED') {
          setError('Milestone must be in Submitted state to verify');
        }
        if (!milestoneData.data.permissions.canVerify) {
          setError('You do not have permission to verify milestones');
        }
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify Milestone</h1>
        <p className="text-gray-600 mb-6">{milestone.title}</p>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* Show BOQ table for BOQ-linked milestones, or Extra info */}
        {isExtra ? (
          <div className="card mb-6 bg-orange-50 border-orange-200">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-orange-800">Extra (Outside BOQ)</h2>
            </div>
            <div className="card-body">
              <p className="text-orange-700 mb-2">
                This milestone is outside the approved BOQ.
              </p>
              <div className="bg-white rounded-lg p-4 border border-orange-200">
                <p className="text-sm text-gray-600">Milestone Value</p>
                <p className="text-2xl font-bold text-orange-700">{formatCurrency(milestone.value)}</p>
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
                  <tr className="bg-gray-50 font-semibold">
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
                <p className="text-xs text-gray-500 mt-1">
                  Enter the actual quantity verified (planned: {totalPlannedQty})
                </p>
              </div>
            )}

            <div className={`rounded-lg p-4 ${isExtra ? 'bg-orange-50' : 'bg-gray-50'}`}>
              <p className="text-sm text-gray-600">
                {isExtra ? 'Value to be Verified:' : 'Estimated Eligible Value:'}
              </p>
              <p className={`text-2xl font-bold ${isExtra ? 'text-orange-600' : 'text-green-600'}`}>
                {formatCurrency(estimatedValue)}
              </p>
              {!isExtra && (
                <p className="text-xs text-gray-500 mt-1">
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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
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
