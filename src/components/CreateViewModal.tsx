'use client';

import { useState } from 'react';

interface ViewConfig {
  filters: {
    trade?: string;
    vendor?: string;
    paymentStatus?: string[];
    milestoneState?: string[];
    isDelayed?: boolean;
    completionMin?: number;
    completionMax?: number;
    dueDateFrom?: string;
    dueDateTo?: string;
  };
  groupBy?: string;
  sortBy?: string;
  sortOrder?: string;
}

interface Template {
  name: string;
  config: ViewConfig;
}

interface CreateViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, config: ViewConfig) => void;
  templates: Template[];
}

const MILESTONE_STATES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'CLOSED', label: 'Closed' },
];

const PAYMENT_STATUSES = [
  { value: 'NOT_ELIGIBLE', label: 'Not Eligible' },
  { value: 'ELIGIBLE', label: 'Eligible' },
  { value: 'DUE_SOON', label: 'Due Soon' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'PAID_MARKED', label: 'Paid' },
];

const GROUP_BY_OPTIONS = [
  { value: '', label: 'No Grouping' },
  { value: 'milestoneState', label: 'Milestone State' },
  { value: 'paymentStatus', label: 'Payment Status' },
  { value: 'completionBucket', label: 'Completion Bucket (0-30, 30-70, 70-100)' },
  { value: 'trade', label: 'Trade' },
];

const SORT_BY_OPTIONS = [
  { value: 'createdAt', label: 'Created Date' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'completion', label: 'Completion %' },
  { value: 'value', label: 'Value' },
];

/**
 * CreateViewModal - Modal for creating custom views.
 *
 * SAFETY: This only creates VIEW CONFIGURATIONS.
 * No milestone data is modified.
 */
export default function CreateViewModal({
  isOpen,
  onClose,
  onCreate,
  templates,
}: CreateViewModalProps) {
  const [name, setName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [config, setConfig] = useState<ViewConfig>({
    filters: {},
    groupBy: undefined,
    sortBy: 'createdAt',
    sortOrder: 'asc',
  });

  const handleTemplateSelect = (template: Template) => {
    setName(template.name);
    setConfig(template.config);
    setShowAdvanced(true);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), config);
    handleClose();
  };

  const handleClose = () => {
    setName('');
    setConfig({
      filters: {},
      groupBy: undefined,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    });
    setShowAdvanced(false);
    onClose();
  };

  const toggleState = (state: string) => {
    const current = config.filters.milestoneState || [];
    const updated = current.includes(state)
      ? current.filter(s => s !== state)
      : [...current, state];
    setConfig({
      ...config,
      filters: {
        ...config.filters,
        milestoneState: updated.length > 0 ? updated : undefined,
      },
    });
  };

  const togglePaymentStatus = (status: string) => {
    const current = config.filters.paymentStatus || [];
    const updated = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    setConfig({
      ...config,
      filters: {
        ...config.filters,
        paymentStatus: updated.length > 0 ? updated : undefined,
      },
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Create Custom View</h2>

          {/* Quick Start with Templates */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Start Templates</h3>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((template, i) => (
                <button
                  key={i}
                  onClick={() => handleTemplateSelect(template)}
                  className="p-2 text-left text-sm border border-gray-200 rounded hover:bg-gray-50 hover:border-primary-300"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>

          <hr className="my-4" />

          {/* View Name */}
          <div className="mb-4">
            <label className="label">View Name *</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Delayed Electrical Work"
            />
          </div>

          {/* Basic Options */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Group By</label>
              <select
                className="input"
                value={config.groupBy || ''}
                onChange={(e) => setConfig({ ...config, groupBy: e.target.value || undefined })}
              >
                {GROUP_BY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Sort By</label>
              <select
                className="input"
                value={config.sortBy || 'createdAt'}
                onChange={(e) => setConfig({ ...config, sortBy: e.target.value })}
              >
                {SORT_BY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sort Order */}
          <div className="mb-4">
            <label className="label">Sort Order</label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="sortOrder"
                  checked={config.sortOrder !== 'desc'}
                  onChange={() => setConfig({ ...config, sortOrder: 'asc' })}
                  className="mr-2"
                />
                Ascending
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="sortOrder"
                  checked={config.sortOrder === 'desc'}
                  onChange={() => setConfig({ ...config, sortOrder: 'desc' })}
                  className="mr-2"
                />
                Descending
              </label>
            </div>
          </div>

          {/* Advanced Filters Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-primary-600 text-sm mb-4"
          >
            {showAdvanced ? '▼ Hide Advanced Filters' : '▶ Show Advanced Filters'}
          </button>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="space-y-4 border-t pt-4">
              {/* Milestone States */}
              <div>
                <label className="label">Filter by Milestone State</label>
                <div className="flex flex-wrap gap-2">
                  {MILESTONE_STATES.map(state => (
                    <button
                      key={state.value}
                      type="button"
                      onClick={() => toggleState(state.value)}
                      className={`px-3 py-1 text-sm rounded border ${
                        config.filters.milestoneState?.includes(state.value)
                          ? 'bg-primary-100 border-primary-500 text-primary-700'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {state.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Status */}
              <div>
                <label className="label">Filter by Payment Status</label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_STATUSES.map(status => (
                    <button
                      key={status.value}
                      type="button"
                      onClick={() => togglePaymentStatus(status.value)}
                      className={`px-3 py-1 text-sm rounded border ${
                        config.filters.paymentStatus?.includes(status.value)
                          ? 'bg-primary-100 border-primary-500 text-primary-700'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delayed Only */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.filters.isDelayed === true}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        filters: {
                          ...config.filters,
                          isDelayed: e.target.checked ? true : undefined,
                        },
                      })
                    }
                    className="mr-2"
                  />
                  Only show delayed milestones
                </label>
              </div>

              {/* Completion Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Min Completion %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="input"
                    value={config.filters.completionMin ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        filters: {
                          ...config.filters,
                          completionMin: e.target.value ? parseInt(e.target.value) : undefined,
                        },
                      })
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="label">Max Completion %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="input"
                    value={config.filters.completionMax ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        filters: {
                          ...config.filters,
                          completionMax: e.target.value ? parseInt(e.target.value) : undefined,
                        },
                      })
                    }
                    placeholder="100"
                  />
                </div>
              </div>

              {/* Due Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Due Date From</label>
                  <input
                    type="date"
                    className="input"
                    value={config.filters.dueDateFrom ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        filters: {
                          ...config.filters,
                          dueDateFrom: e.target.value || undefined,
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Due Date To</label>
                  <input
                    type="date"
                    className="input"
                    value={config.filters.dueDateTo ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        filters: {
                          ...config.filters,
                          dueDateTo: e.target.value || undefined,
                        },
                      })
                    }
                  />
                </div>
              </div>

              {/* Trade Filter */}
              <div>
                <label className="label">Filter by Trade (keyword)</label>
                <input
                  type="text"
                  className="input"
                  value={config.filters.trade ?? ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      filters: {
                        ...config.filters,
                        trade: e.target.value || undefined,
                      },
                    })
                  }
                  placeholder="e.g., Electrical, Plumbing"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
            <button onClick={handleClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="btn btn-primary"
            >
              Create View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
