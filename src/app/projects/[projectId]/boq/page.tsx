'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency } from '@/lib/utils';

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
  revisions: Array<{
    revisionNumber: number;
    reason: string;
    createdAt: string;
  }>;
}

export default function BOQPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [boqs, setBoqs] = useState<BOQ[]>([]);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    description: '',
    unit: '',
    plannedQty: '',
    rate: '',
  });

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const [projectRes, boqRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/boq`),
      ]);

      const [projectData, boqData] = await Promise.all([
        projectRes.json(),
        boqRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
        setPermissions(projectData.data.permissions);
      }

      if (boqData.success) {
        setBoqs(boqData.data);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBOQ = async () => {
    const res = await fetch(`/api/projects/${projectId}/boq`, {
      method: 'POST',
    });
    const data = await res.json();
    if (data.success) {
      loadData();
    } else {
      setError(data.error);
    }
  };

  const handleAddItem = async (boqId: string) => {
    const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: newItem.description,
        unit: newItem.unit,
        plannedQty: parseFloat(newItem.plannedQty),
        rate: parseFloat(newItem.rate),
      }),
    });

    const data = await res.json();
    if (data.success) {
      setShowAddItem(false);
      setNewItem({ description: '', unit: '', plannedQty: '', rate: '' });
      loadData();
    } else {
      setError(data.error);
    }
  };

  const handleApproveBOQ = async (boqId: string) => {
    if (!confirm('Are you sure you want to approve this BOQ? It will be locked after approval.')) {
      return;
    }

    const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/approve`, {
      method: 'POST',
    });

    const data = await res.json();
    if (data.success) {
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

  const currentBOQ = boqs[0];
  const totalValue = currentBOQ?.items.reduce((sum, item) => sum + item.plannedValue, 0) || 0;

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Bill of Quantities</h1>
          {!currentBOQ && permissions.canEditBOQ && (
            <button onClick={handleCreateBOQ} className="btn btn-primary">
              Create BOQ
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {!currentBOQ ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-gray-500">No BOQ created yet</p>
            </div>
          </div>
        ) : (
          <>
            {/* BOQ Header */}
            <div className="card">
              <div className="card-body">
                <div className="flex justify-between items-center">
                  <div>
                    <span className={`badge ${currentBOQ.status === 'DRAFT' ? 'badge-draft' : 'badge-verified'}`}>
                      {currentBOQ.status}
                    </span>
                    {currentBOQ.revisions.length > 0 && (
                      <span className="ml-2 text-sm text-gray-500">
                        (Revision {currentBOQ.revisions.length})
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Total Value</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalValue)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* BOQ Items */}
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <h2 className="text-lg font-semibold">Items ({currentBOQ.items.length})</h2>
                {permissions.canEditBOQ && currentBOQ.status === 'DRAFT' && (
                  <button onClick={() => setShowAddItem(true)} className="btn btn-sm btn-primary">
                    Add Item
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Unit</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentBOQ.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td>{item.unit}</td>
                        <td className="text-right">{item.plannedQty}</td>
                        <td className="text-right">{formatCurrency(item.rate)}</td>
                        <td className="text-right font-medium">{formatCurrency(item.plannedValue)}</td>
                      </tr>
                    ))}
                    {currentBOQ.items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-gray-500 py-8">
                          No items added yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {currentBOQ.items.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td colSpan={4} className="text-right">Total</td>
                        <td className="text-right">{formatCurrency(totalValue)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Actions */}
            {currentBOQ.status === 'DRAFT' && permissions.canApproveBOQ && currentBOQ.items.length > 0 && (
              <div className="flex justify-end">
                <button onClick={() => handleApproveBOQ(currentBOQ.id)} className="btn btn-success">
                  Approve BOQ
                </button>
              </div>
            )}

            {/* Revisions */}
            {currentBOQ.revisions.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h2 className="text-lg font-semibold">Revision History</h2>
                </div>
                <div className="card-body">
                  <ul className="space-y-2">
                    {currentBOQ.revisions.map((rev) => (
                      <li key={rev.revisionNumber} className="text-sm">
                        <span className="font-medium">Revision {rev.revisionNumber}:</span>{' '}
                        <span className="text-gray-600">{rev.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddItem && currentBOQ && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Add BOQ Item</h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Description</label>
                  <input
                    type="text"
                    className="input"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input
                    type="text"
                    className="input"
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    placeholder="e.g., sqm, nos, rmt"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Quantity</label>
                    <input
                      type="number"
                      className="input"
                      value={newItem.plannedQty}
                      onChange={(e) => setNewItem({ ...newItem, plannedQty: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Rate</label>
                    <input
                      type="number"
                      className="input"
                      value={newItem.rate}
                      onChange={(e) => setNewItem({ ...newItem, rate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button onClick={() => setShowAddItem(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button onClick={() => handleAddItem(currentBOQ.id)} className="btn btn-primary">
                    Add Item
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
