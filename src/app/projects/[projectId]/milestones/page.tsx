'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Milestone {
  id: string;
  title: string;
  description?: string;
  state: string;
  paymentModel: string;
  advancePercent: number;
  value: number;
  isExtra: boolean;
  extraApprovedAt: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  boqLinks?: Array<{
    id: string;
    plannedQty: number;
    boqItem: {
      id: string;
      description: string;
      unit: string;
      rate: number;
    };
  }>;
  paymentEligibility?: {
    state: string;
    eligibleAmount: number;
    advanceAmount: number;
    remainingAmount: number;
  };
}

interface BOQItem {
  id: string;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
  plannedValue: number;
}

interface BOQ {
  id: string;
  status: string;
  items: BOQItem[];
}

export default function MilestonesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [boqItems, setBoqItems] = useState<BOQItem[]>([]);
  const [newMilestone, setNewMilestone] = useState({
    title: '',
    description: '',
    plannedEnd: '',
    value: '',
    advancePercent: '',
    isExtra: false,
    selectedBoqItemId: '',
    boqQty: '',
  });

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const [projectRes, milestonesRes, boqRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/milestones`),
        fetch(`/api/projects/${projectId}/boq`),
      ]);

      const [projectData, milestonesData, boqData] = await Promise.all([
        projectRes.json(),
        milestonesRes.json(),
        boqRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
        setPermissions(projectData.data.permissions);
      }

      if (milestonesData.success) {
        setMilestones(milestonesData.data);
      }

      // Extract all BOQ items from approved BOQs
      if (boqData.success && boqData.data) {
        const approvedBoq = boqData.data.find((b: BOQ) => b.status === 'APPROVED');
        if (approvedBoq) {
          setBoqItems(approvedBoq.items || []);
        }
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleDelete = async (milestoneId: string) => {
    const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}`, {
      method: 'DELETE',
    });

    const data = await res.json();
    if (data.success) {
      setDeleteConfirm(null);
      loadData();
    } else {
      setError(data.error);
      setDeleteConfirm(null);
    }
  };

  const handleCreate = async () => {
    // Build BOQ links if a BOQ item is selected
    const boqLinks = newMilestone.selectedBoqItemId && newMilestone.boqQty
      ? [{ boqItemId: newMilestone.selectedBoqItemId, plannedQty: parseFloat(newMilestone.boqQty) }]
      : undefined;

    const res = await fetch(`/api/projects/${projectId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newMilestone.title,
        description: newMilestone.description || undefined,
        plannedEnd: newMilestone.plannedEnd || undefined,
        value: newMilestone.value ? parseFloat(newMilestone.value) : 0,
        advancePercent: newMilestone.advancePercent ? parseFloat(newMilestone.advancePercent) : 0,
        isExtra: newMilestone.isExtra,
        boqLinks,
      }),
    });

    const data = await res.json();
    if (data.success) {
      setShowCreate(false);
      setNewMilestone({
        title: '',
        description: '',
        plannedEnd: '',
        value: '',
        advancePercent: '',
        isExtra: false,
        selectedBoqItemId: '',
        boqQty: '',
      });
      loadData();
    } else {
      setError(data.error);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Milestones</h1>
          {permissions.canEditMilestones && (
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              Create Milestone
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {milestones.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-gray-500">No milestones created yet</p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>State</th>
                    <th>Due Date</th>
                    <th>Payment Status</th>
                    <th>Total Value</th>
                    <th>Eligible</th>
                    <th>Advance</th>
                    <th>Remaining</th>
                    {myRole === 'OWNER' && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((milestone) => (
                    <tr key={milestone.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/projects/${projectId}/milestones/${milestone.id}`}
                            className="text-primary-600 hover:underline font-medium"
                          >
                            {milestone.title}
                          </Link>
                          {milestone.isExtra && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              milestone.extraApprovedAt
                                ? 'bg-green-100 text-green-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {milestone.extraApprovedAt ? 'Extra ✓' : 'Extra (Pending)'}
                            </span>
                          )}
                        </div>
                        {milestone.description && (
                          <p className="text-xs text-gray-500 mt-1 truncate max-w-xs">
                            {milestone.description}
                          </p>
                        )}
                      </td>
                      <td>
                        <MilestoneStateBadge state={milestone.state as any} />
                      </td>
                      <td className="text-gray-500">{formatDate(milestone.plannedEnd)}</td>
                      <td>
                        {milestone.paymentEligibility ? (
                          <PaymentStatusBadge state={milestone.paymentEligibility.state as any} />
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="font-medium">
                        {formatCurrency(milestone.value || 0)}
                      </td>
                      <td className={`font-medium ${
                        (milestone.paymentEligibility?.eligibleAmount ?? 0) > 0 ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        {milestone.paymentEligibility
                          ? formatCurrency(milestone.paymentEligibility.eligibleAmount)
                          : '-'}
                      </td>
                      <td className="text-gray-600">
                        {milestone.paymentEligibility?.advanceAmount
                          ? formatCurrency(milestone.paymentEligibility.advanceAmount)
                          : '-'}
                        {milestone.advancePercent > 0 && (
                          <span className="text-xs text-gray-400 ml-1">({milestone.advancePercent}%)</span>
                        )}
                      </td>
                      <td className="font-medium text-orange-600">
                        {milestone.paymentEligibility?.remainingAmount
                          ? formatCurrency(milestone.paymentEligibility.remainingAmount)
                          : '-'}
                      </td>
                      {myRole === 'OWNER' && (
                        <td>
                          <button
                            onClick={() => setDeleteConfirm(milestone.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-red-600">Delete Milestone</h2>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete this milestone? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setDeleteConfirm(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="btn bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Create Milestone</h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Title *</label>
                  <input
                    type="text"
                    className="input"
                    value={newMilestone.title}
                    onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={newMilestone.description}
                    onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })}
                  />
                </div>

                {/* BOQ Link or Extras Toggle */}
                <div className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center mb-3">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={newMilestone.isExtra}
                        onChange={(e) => setNewMilestone({
                          ...newMilestone,
                          isExtra: e.target.checked,
                          selectedBoqItemId: e.target.checked ? '' : newMilestone.selectedBoqItemId,
                          boqQty: e.target.checked ? '' : newMilestone.boqQty,
                        })}
                      />
                      <span className="text-sm font-medium text-orange-700">
                        Extras (Outside BOQ)
                      </span>
                    </label>
                  </div>

                  {newMilestone.isExtra ? (
                    <div className="bg-orange-50 border border-orange-200 rounded p-2">
                      <p className="text-xs text-orange-700">
                        ⚠️ This milestone is outside the approved BOQ and requires Owner approval.
                        The associated vendor will be flagged as high risk.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2">
                        <label className="label text-sm">Link to BOQ Item</label>
                        <select
                          className="input"
                          value={newMilestone.selectedBoqItemId}
                          onChange={(e) => {
                            const selectedItem = boqItems.find(item => item.id === e.target.value);
                            setNewMilestone({
                              ...newMilestone,
                              selectedBoqItemId: e.target.value,
                              // Auto-fill value based on BOQ rate if qty is set
                              value: selectedItem && newMilestone.boqQty
                                ? String(selectedItem.rate * parseFloat(newMilestone.boqQty))
                                : newMilestone.value,
                            });
                          }}
                        >
                          <option value="">-- Select BOQ Item --</option>
                          {boqItems.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.description} ({item.unit}) - Rate: {formatCurrency(item.rate)} | Available: {item.plannedQty}
                            </option>
                          ))}
                        </select>
                      </div>
                      {newMilestone.selectedBoqItemId && (
                        <div>
                          <label className="label text-sm">Quantity from BOQ</label>
                          <input
                            type="number"
                            className="input"
                            placeholder="0"
                            min="0"
                            step="0.01"
                            value={newMilestone.boqQty}
                            onChange={(e) => {
                              const selectedItem = boqItems.find(item => item.id === newMilestone.selectedBoqItemId);
                              const qty = parseFloat(e.target.value) || 0;
                              setNewMilestone({
                                ...newMilestone,
                                boqQty: e.target.value,
                                // Auto-calculate value from BOQ rate × qty
                                value: selectedItem ? String(selectedItem.rate * qty) : newMilestone.value,
                              });
                            }}
                          />
                          {newMilestone.boqQty && (
                            <p className="text-xs text-green-600 mt-1">
                              Calculated value: {formatCurrency(
                                (boqItems.find(i => i.id === newMilestone.selectedBoqItemId)?.rate || 0) *
                                parseFloat(newMilestone.boqQty || '0')
                              )}
                            </p>
                          )}
                        </div>
                      )}
                      {boqItems.length === 0 && (
                        <p className="text-xs text-gray-500">No approved BOQ items available. Create a BOQ first or mark as Extras.</p>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="label">Value *</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={newMilestone.value}
                    onChange={(e) => setNewMilestone({ ...newMilestone, value: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {newMilestone.selectedBoqItemId ? 'Auto-calculated from BOQ (editable)' : 'Total milestone value'}
                  </p>
                </div>
                <div>
                  <label className="label">Advance Percentage</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="0"
                    min="0"
                    max="100"
                    step="1"
                    value={newMilestone.advancePercent}
                    onChange={(e) => setNewMilestone({ ...newMilestone, advancePercent: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {newMilestone.value && newMilestone.advancePercent ? (
                      <>
                        Advance: {formatCurrency(parseFloat(newMilestone.value) * parseFloat(newMilestone.advancePercent) / 100)} |
                        Remaining on verification: {formatCurrency(parseFloat(newMilestone.value) * (100 - parseFloat(newMilestone.advancePercent)) / 100)}
                      </>
                    ) : (
                      'Optional: % paid upfront, rest due on verification'
                    )}
                  </p>
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input
                    type="date"
                    className="input"
                    value={newMilestone.plannedEnd}
                    onChange={(e) => setNewMilestone({ ...newMilestone, plannedEnd: e.target.value })}
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button onClick={() => setShowCreate(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    className={`btn ${newMilestone.isExtra ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'btn-primary'}`}
                  >
                    {newMilestone.isExtra ? 'Create & Send for Approval' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
