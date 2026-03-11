'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency } from '@/lib/utils';

interface VendorUser {
  userId: string;
  name: string;
  email: string;
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

export default function CreateMilestonePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [boqItems, setBoqItems] = useState<BOQItem[]>([]);
  const [vendors, setVendors] = useState<VendorUser[]>([]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    plannedEnd: '',
    value: '',
    advancePercent: '',
    isExtra: false,
    selectedBoqItemId: '',
    boqQty: '',
    vendorUserId: '',
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

        // Check permission
        if (!projectData.data.permissions?.canEditMilestones) {
          setError('You do not have permission to create milestones.');
        }
      } else {
        setError(projectData.error || 'Failed to load project');
      }

      if (boqData.success && boqData.data) {
        const approvedBoq = boqData.data.find((b: BOQ) => b.status === 'APPROVED');
        if (approvedBoq) {
          setBoqItems(approvedBoq.items || []);
        }
      }

      // Load vendor users (OWNER/PMC only)
      if (projectData.success && (projectData.data.myRole === 'OWNER' || projectData.data.myRole === 'PMC')) {
        try {
          const vendorsRes = await fetch(`/api/admin/vendors?projectId=${projectId}`);
          const vendorsData = await vendorsRes.json();
          if (vendorsData.success) {
            setVendors(vendorsData.data);
          }
        } catch {
          // Vendor dropdown is optional
        }
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (updates: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }

    setSubmitting(true);
    setError('');

    const boqLinks =
      form.selectedBoqItemId && form.boqQty
        ? [{ boqItemId: form.selectedBoqItemId, plannedQty: parseFloat(form.boqQty) }]
        : undefined;

    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          plannedEnd: form.plannedEnd || undefined,
          value: form.value ? parseFloat(form.value) : 0,
          advancePercent: form.advancePercent ? parseFloat(form.advancePercent) : 0,
          isExtra: form.isExtra,
          vendorUserId: form.vendorUserId || null,
          boqLinks,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/projects/${projectId}/milestones`);
      } else {
        setError(data.error || 'Failed to create milestone');
      }
    } catch {
      setError('An error occurred while creating the milestone');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12 text-surface-400">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="max-w-3xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <Link
            href={`/projects/${projectId}/milestones`}
            className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Milestones
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Create Milestone</h1>
          <p className="text-surface-500 mt-1">
            Add a new milestone to track project progress and payments.
          </p>
        </div>

        {error && <div className="alert alert-error mb-6">{error}</div>}

        <div className="space-y-6">
          {/* ── Section 1: Milestone Details ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">Milestone Details</h2>
            </div>
            <div className="card-body space-y-5">
              <div>
                <label className="label">Title *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Foundation Work Complete"
                  value={form.title}
                  onChange={(e) => updateForm({ title: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Describe the scope and deliverables for this milestone..."
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Due Date</label>
                <input
                  type="date"
                  className="input"
                  value={form.plannedEnd}
                  onChange={(e) => updateForm({ plannedEnd: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* ── Section 2: Pricing & BOQ ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">Pricing &amp; BOQ</h2>
            </div>
            <div className="card-body space-y-5">
              {/* Extras toggle */}
              <div className="rounded-lg border border-surface-200 p-4 bg-surface-50/50">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-surface-300 text-orange-600 focus:ring-orange-500"
                    checked={form.isExtra}
                    onChange={(e) =>
                      updateForm({
                        isExtra: e.target.checked,
                        selectedBoqItemId: e.target.checked ? '' : form.selectedBoqItemId,
                        boqQty: e.target.checked ? '' : form.boqQty,
                      })
                    }
                  />
                  <span className="text-sm font-medium text-orange-700">
                    Mark as Extra (Outside BOQ)
                  </span>
                </label>

                {form.isExtra && (
                  <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-sm text-orange-700">
                      This milestone is outside the approved BOQ and will require Owner approval before payments can be processed.
                    </p>
                  </div>
                )}
              </div>

              {/* BOQ Item Link — only when not Extra */}
              {!form.isExtra && (
                <div className="space-y-4">
                  <div>
                    <label className="label">Link to BOQ Item</label>
                    <select
                      className="input"
                      value={form.selectedBoqItemId}
                      onChange={(e) => {
                        const selectedItem = boqItems.find((item) => item.id === e.target.value);
                        updateForm({
                          selectedBoqItemId: e.target.value,
                          value:
                            selectedItem && form.boqQty
                              ? String(selectedItem.rate * parseFloat(form.boqQty))
                              : form.value,
                        });
                      }}
                    >
                      <option value="">-- Select BOQ Item --</option>
                      {boqItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.description} ({item.unit}) &mdash; Rate: {formatCurrency(item.rate)} | Available: {item.plannedQty}
                        </option>
                      ))}
                    </select>
                    {boqItems.length === 0 && (
                      <p className="text-xs text-surface-400 mt-1.5">
                        No approved BOQ items available. Create a BOQ first or mark this milestone as Extra.
                      </p>
                    )}
                  </div>

                  {form.selectedBoqItemId && (
                    <div>
                      <label className="label">Quantity from BOQ</label>
                      <input
                        type="number"
                        className="input"
                        placeholder="0"
                        min="0"
                        step="0.01"
                        value={form.boqQty}
                        onChange={(e) => {
                          const selectedItem = boqItems.find((item) => item.id === form.selectedBoqItemId);
                          const qty = parseFloat(e.target.value) || 0;
                          updateForm({
                            boqQty: e.target.value,
                            value: selectedItem ? String(selectedItem.rate * qty) : form.value,
                          });
                        }}
                      />
                      {form.boqQty && (
                        <p className="text-xs text-green-600 mt-1.5">
                          Calculated value:{' '}
                          {formatCurrency(
                            (boqItems.find((i) => i.id === form.selectedBoqItemId)?.rate || 0) *
                              parseFloat(form.boqQty || '0')
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Value */}
              <div>
                <label className="label">Value *</label>
                <input
                  type="number"
                  className="input"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={form.value}
                  onChange={(e) => updateForm({ value: e.target.value })}
                />
                <p className="text-xs text-surface-400 mt-1.5">
                  {form.selectedBoqItemId
                    ? 'Auto-calculated from BOQ (editable)'
                    : 'Total milestone value'}
                </p>
              </div>

              {/* Advance Percentage */}
              <div>
                <label className="label">Advance Percentage</label>
                <input
                  type="number"
                  className="input"
                  placeholder="0"
                  min="0"
                  max="100"
                  step="1"
                  value={form.advancePercent}
                  onChange={(e) => updateForm({ advancePercent: e.target.value })}
                />
                <p className="text-xs text-surface-400 mt-1.5">
                  {form.value && form.advancePercent ? (
                    <>
                      Advance:{' '}
                      {formatCurrency(
                        (parseFloat(form.value) * parseFloat(form.advancePercent)) / 100
                      )}{' '}
                      | Remaining on verification:{' '}
                      {formatCurrency(
                        (parseFloat(form.value) * (100 - parseFloat(form.advancePercent))) / 100
                      )}
                    </>
                  ) : (
                    'Optional: % paid upfront, rest due on verification'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* ── Section 3: Vendor Assignment (conditional) ── */}
          {vendors.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold">Vendor Assignment</h2>
              </div>
              <div className="card-body">
                <div>
                  <label className="label">Assign Vendor</label>
                  <select
                    className="input"
                    value={form.vendorUserId}
                    onChange={(e) => updateForm({ vendorUserId: e.target.value })}
                  >
                    <option value="">-- No vendor assigned --</option>
                    {vendors.map((v) => (
                      <option key={v.userId} value={v.userId}>
                        {v.name} ({v.email})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-surface-400 mt-1.5">
                    Assign a vendor responsible for delivering this milestone.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Action bar ── */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-10">
            <Link
              href={`/projects/${projectId}/milestones`}
              className="btn btn-secondary"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.title.trim()}
              className={`btn ${
                form.isExtra
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'btn-primary'
              } disabled:opacity-50`}
            >
              {submitting
                ? 'Creating...'
                : form.isExtra
                ? 'Create & Send for Approval'
                : 'Create Milestone'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
