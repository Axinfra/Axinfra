'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, CheckCircle2, Calendar, GripVertical, Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';
import ImportBOQModal from '@/components/orders/ImportBOQModal';

interface OrderBOQ {
  id: string;
  status: string;
  itemsCount: number;
}

interface Order {
  id: string;
  name: string;
  sortOrder: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  createdAt: string;
  boqs: OrderBOQ[];
}

interface Props {
  projectId: string;
  userRole: 'CLIENT' | 'PMC' | 'VENDOR' | 'VIEWER' | string;
}

const PAGE_SIZE = 8;

/** One badge per status present, with a count — "3 Draft", "1 Approved" — instead of one
 * badge per BOQ, so this stays readable whether a Purchase Order has 4 BOQs or 400. */
function BOQStatusBadge({ status, count }: { status: string; count: number }) {
  const label = (base: string) => (count > 1 ? `${count} ${base}` : base);
  if (status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 badge badge-verified text-xs">
        <CheckCircle2 className="w-3 h-3" />
        {label('Approved')}
      </span>
    );
  }
  if (status === 'PENDING_APPROVAL') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,179,8,0.15)] text-[#eab308] font-medium">
        {label('Pending Approval')}
      </span>
    );
  }
  if (status === 'REVISED') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,88,12,0.12)] text-[#f97316] font-medium">
        {label('Needs Revision')}
      </span>
    );
  }
  return <span className="badge badge-draft text-xs">{label('Draft')}</span>;
}

export default function OrderList({ projectId, userRole }: Props) {
  const router = useRouter();

  const canEdit   = userRole === 'CLIENT' || userRole === 'PMC';
  const canDelete = userRole === 'CLIENT' || userRole === 'PMC';

  const {
    data: orders = [],
    isLoading,
    mutate: refetch,
  } = useSWR<Order[]>(
    projectId ? `/api/projects/${projectId}/phases` : null,
    jsonFetcher,
    { dedupingInterval: 5_000 },
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const isExpanded = (id: string) => !expanded.has(id);

  // Add / insert order modal
  const [showAdd, setShowAdd]           = useState(false);
  const [newName, setNewName]           = useState('');
  const [newStart, setNewStart]         = useState('');
  const [newEnd, setNewEnd]             = useState('');
  const [adding, setAdding]             = useState(false);
  // null = append at end; a number = insert at that gap index between orders
  const [insertGapIndex, setInsertGapIndex] = useState<number | null>(null);

  // Drag-to-reorder
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [reordering, setReordering]     = useState(false);

  // Inline edit
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState('');
  const [saving, setSaving]             = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [deleteError, setDeleteError]   = useState('');
  const [deleting, setDeleting]         = useState(false);

  const [apiError, setApiError]         = useState('');

  // Import BOQ from Excel
  const [showImport, setShowImport]     = useState(false);

  // Pagination — a project with dozens of Purchase Orders shouldn't render them all at once.
  // Drag-to-reorder only ever needs to work against the currently-visible page's DOM nodes, so
  // slicing for render is safe as long as indices passed into the drag handlers stay absolute
  // (page * PAGE_SIZE + relative index) rather than page-relative.
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageOrders = orders.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Persists a full reordering of orders as sequential sortOrder values (0, 1, 2…).
  // `baseline` is the order list to diff against — pass a freshly-fetched list when
  // one is available (e.g. right after creating a order) since `orders` may be stale.
  const reorderOrders = async (baseline: Order[], orderedIds: string[]) => {
    const byId = new Map(baseline.map((p) => [p.id, p]));
    const next = orderedIds
      .map((id, index) => {
        const p = byId.get(id);
        return p ? { ...p, sortOrder: index } : null;
      })
      .filter((p): p is Order => p !== null);

    setReordering(true);
    void refetch(next, { revalidate: false });

    const changes = orderedIds
      .map((id, index) => ({ id, index, prevOrder: byId.get(id)?.sortOrder }))
      .filter(({ prevOrder, index }) => prevOrder !== undefined && prevOrder !== index);

    try {
      await Promise.all(
        changes.map(({ id, index }) =>
          fetch(`/api/projects/${projectId}/phases/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sortOrder: index }),
          }),
        ),
      );
    } catch {
      setApiError('Failed to save the new order sequence');
    } finally {
      setReordering(false);
      void refetch();
    }
  };

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    if (draggedIndex === null) return;
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = draggedIndex;
    setDraggedIndex(null);
    setDragOverIndex(null);
    if (from === null || from === index) return;
    const ids = orders.map((p) => p.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(index, 0, moved);
    void reorderOrders(orders, ids);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleAddOrder = async () => {
    const name = newName.trim();
    if (!name) return;
    if (newStart && newEnd && newStart >= newEnd) {
      setApiError('Start date must be before end date');
      return;
    }
    setAdding(true);
    setApiError('');

    const gapIndex = insertGapIndex;
    const tempId = `temp-${Date.now()}`;
    void refetch(
      (current = []) => {
        const draft: Order = {
          id: tempId,
          name,
          sortOrder: gapIndex ?? (current[current.length - 1]?.sortOrder ?? 0) + 1,
          plannedStart: newStart || null,
          plannedEnd: newEnd || null,
          createdAt: new Date().toISOString(),
          boqs: [],
        };
        if (gapIndex === null) return [...current, draft];
        const next = [...current];
        next.splice(gapIndex, 0, draft);
        return next;
      },
      { revalidate: false },
    );

    setShowAdd(false);
    setNewName('');
    setNewStart('');
    setNewEnd('');

    try {
      const res = await fetch(`/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          plannedStart: newStart || undefined,
          plannedEnd:   newEnd   || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        if (gapIndex !== null) {
          // Re-fetch to get the real record, then renumber sortOrder so the new
          // order actually lands in the gap the user dropped it into.
          const fresh = await refetch();
          if (fresh) {
            const newId = json.data.id as string;
            const ids = fresh.map((p) => p.id).filter((id) => id !== newId);
            ids.splice(gapIndex, 0, newId);
            await reorderOrders(fresh, ids);
          }
        } else {
          void refetch();
        }
        setInsertGapIndex(null);
      } else {
        void refetch();
        setApiError(json.error ?? 'Failed to create order');
        setShowAdd(true);
        setNewName(name);
      }
    } catch {
      void refetch();
      setApiError('An error occurred');
      setShowAdd(true);
      setNewName(name);
    } finally {
      setAdding(false);
    }
  };

  const handleRename = async (orderId: string) => {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    setApiError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/phases/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (json.success) {
        setEditingId(null);
        void refetch();
      } else {
        setApiError(json.error ?? 'Failed to update order');
      }
    } catch {
      setApiError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (orderId: string) => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/phases/${orderId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setDeleteId(null);
        void refetch();
      } else {
        setDeleteError(json.error ?? 'Failed to delete order');
      }
    } catch {
      setDeleteError('An error occurred');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-semibold text-[#e8e4dc]">Purchase Orders</h2>
          {reordering && (
            <span className="flex items-center gap-1.5 text-xs text-[rgba(232,228,220,0.4)]">
              <span className="w-3 h-3 rounded-full border-2 border-[var(--ax-accent)] border-t-transparent animate-spin" />
              Saving order…
            </span>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)} className="btn btn-sm btn-secondary">
              ↑ Import Excel
            </button>
            <button
              onClick={() => { setInsertGapIndex(null); setShowAdd(true); setApiError(''); }}
              className="btn btn-sm btn-primary"
            >
              + Add Purchase Order
            </button>
          </div>
        )}
      </div>

      {canEdit && orders.length > 1 && (
        <p className="text-xs text-[rgba(232,228,220,0.35)] -mt-2">
          Drag <GripVertical className="inline w-3 h-3 -mt-0.5 mx-0.5" /> to reorder, or hover between orders to insert a new one.
        </p>
      )}

      {apiError && <div className="alert alert-error">{apiError}</div>}

      {/* Empty state */}
      {orders.length === 0 && (
        <div className="card">
          <div className="card-body text-center py-10">
            <p className="text-[rgba(232,228,220,0.55)]">
              No purchase orders yet. Add your first purchase order to get started.
            </p>
          </div>
        </div>
      )}

      {/* Order rows */}
      {pageOrders.map((order, pageI) => {
        const i = currentPage * PAGE_SIZE + pageI;
        const open = isExpanded(order.id);
        const isEditing = editingId === order.id;
        const isDragging = draggedIndex === i;
        const isDropTarget = dragOverIndex === i && draggedIndex !== null && draggedIndex !== i;
        const canDrag = canEdit && editingId === null;

        return (
          <div key={order.id}>
            {/* Insert-order gap — sits above this order */}
            {canEdit && (
              <div className="relative h-4 -my-2 group/gap z-10">
                <button
                  onClick={() => { setInsertGapIndex(i); setShowAdd(true); setApiError(''); }}
                  aria-label="Insert purchase order here"
                  title="Insert purchase order here"
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/gap:opacity-100 focus-visible:opacity-100 transition-opacity duration-150"
                >
                  <span className="flex-1 border-t border-dashed border-[rgba(var(--ax-accent-rgb),0.4)]" />
                  <span className="mx-2 w-5 h-5 rounded-full bg-[var(--ax-accent)] text-[#0d0f13] flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.4)] hover:scale-110 transition-transform shrink-0">
                    <Plus className="w-3 h-3" strokeWidth={2.5} />
                  </span>
                  <span className="flex-1 border-t border-dashed border-[rgba(var(--ax-accent-rgb),0.4)]" />
                </button>
              </div>
            )}

            <div
              draggable={canDrag}
              onDragStart={handleDragStart(i)}
              onDragOver={handleDragOver(i)}
              onDrop={handleDrop(i)}
              onDragEnd={handleDragEnd}
              className={`card border transition-all duration-150 ${
                isDragging
                  ? 'opacity-40 scale-[0.98] border-[rgba(var(--ax-accent-rgb),0.4)]'
                  : isDropTarget
                  ? 'border-[var(--ax-accent)] shadow-[0_0_0_1px_var(--ax-accent)]'
                  : 'border-[rgba(255,255,255,0.07)]'
              }`}
            >
            {/* Order header row */}
            <div className="card-body py-3 px-4">
              <div className="flex items-center gap-3">
                {canDrag && (
                  <span
                    className="text-[rgba(232,228,220,0.25)] hover:text-[rgba(232,228,220,0.55)] cursor-grab active:cursor-grabbing shrink-0 touch-none"
                    title="Drag to reorder"
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>
                )}
                <button
                  onClick={() => toggleExpand(order.id)}
                  className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors shrink-0"
                  aria-label={open ? 'Collapse' : 'Expand'}
                >
                  {open
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />}
                </button>

                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      autoFocus
                      type="text"
                      className="input py-1 text-sm flex-1"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRename(order.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button
                      onClick={() => void handleRename(order.id)}
                      disabled={saving}
                      className="btn btn-sm btn-primary"
                    >
                      {saving ? '…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn btn-sm btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-[#e8e4dc] truncate block">
                      {order.name}
                    </span>
                    {(order.plannedStart || order.plannedEnd) && (
                      <span className="flex items-center gap-1 text-[11px] text-[rgba(232,228,220,0.38)] mt-0.5">
                        <Calendar className="w-3 h-3 shrink-0" />
                        {order.plannedStart ? formatDate(order.plannedStart) : '—'}
                        {' → '}
                        {order.plannedEnd ? formatDate(order.plannedEnd) : '—'}
                      </span>
                    )}
                  </div>
                )}

                {!isEditing && canEdit && (
                  <button
                    onClick={() => { setEditingId(order.id); setEditName(order.name); setApiError(''); }}
                    className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[var(--ax-accent)] transition-colors"
                  >
                    Edit
                  </button>
                )}
                {!isEditing && canDelete && (
                  <button
                    onClick={() => { setDeleteId(order.id); setDeleteError(''); }}
                    className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[#e06050] transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Expanded detail */}
            {open && (
              <div className="border-t border-[rgba(255,255,255,0.06)] px-4 py-3 space-y-2">
                {/* Dates row */}
                {(order.plannedStart || order.plannedEnd) && (
                  <div className="flex items-center gap-2 text-sm text-[rgba(232,228,220,0.65)]">
                    <span className="w-1 h-1 rounded-full bg-[rgba(232,228,220,0.3)]" />
                    <Calendar className="w-3.5 h-3.5 shrink-0 text-[var(--ax-accent)]" />
                    <span>
                      {order.plannedStart ? formatDate(order.plannedStart) : '—'}
                      {' → '}
                      {order.plannedEnd ? formatDate(order.plannedEnd) : '—'}
                    </span>
                  </div>
                )}

                {/* BOQs row — a Purchase Order can hold any number of BOQs, so this shows one
                    badge per status (with a count) instead of one badge per BOQ. */}
                {(() => {
                  const boqsWithItems = order.boqs.filter((b) => b.itemsCount > 0);
                  const counts = new Map<string, number>();
                  for (const b of boqsWithItems) counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
                  const statusOrder = ['REVISED', 'PENDING_APPROVAL', 'DRAFT', 'APPROVED'];
                  const presentStatuses = statusOrder.filter((s) => counts.has(s));
                  return (
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-[rgba(232,228,220,0.65)] flex-wrap">
                        <span className="w-1 h-1 rounded-full bg-[rgba(232,228,220,0.3)]" />
                        {boqsWithItems.length > 0 ? (
                          <>
                            <span>{boqsWithItems.length} BOQ{boqsWithItems.length > 1 ? 's' : ''}:</span>
                            {presentStatuses.map((status) => (
                              <BOQStatusBadge key={status} status={status} count={counts.get(status)!} />
                            ))}
                          </>
                        ) : (
                          <span>No BOQs yet</span>
                        )}
                      </div>
                      <button
                        onClick={() => router.push(`/projects/${projectId}/orders/${order.id}`)}
                        className="btn btn-sm btn-secondary text-xs"
                      >
                        View Purchase Order
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
            </div>
          </div>
        );
      })}

      {/* Bottom insert gap — append after the last order (only shown on the last page, since
          that's where the true end of the list is) */}
      {canEdit && orders.length > 0 && currentPage === totalPages - 1 && (
        <div className="relative h-4 -my-2 group/gap z-10">
          <button
            onClick={() => { setInsertGapIndex(orders.length); setShowAdd(true); setApiError(''); }}
            aria-label="Add purchase order at the end"
            title="Add purchase order at the end"
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/gap:opacity-100 focus-visible:opacity-100 transition-opacity duration-150"
          >
            <span className="flex-1 border-t border-dashed border-[rgba(var(--ax-accent-rgb),0.4)]" />
            <span className="mx-2 w-5 h-5 rounded-full bg-[var(--ax-accent)] text-[#0d0f13] flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.4)] hover:scale-110 transition-transform shrink-0">
              <Plus className="w-3 h-3" strokeWidth={2.5} />
            </span>
            <span className="flex-1 border-t border-dashed border-[rgba(var(--ax-accent-rgb),0.4)]" />
          </button>
        </div>
      )}

      {/* Pagination */}
      {orders.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-[rgba(232,228,220,0.4)]">
            Showing {currentPage * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE + PAGE_SIZE, orders.length)} of {orders.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="btn btn-sm btn-secondary disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-xs text-[rgba(232,228,220,0.45)] px-2">{currentPage + 1} / {totalPages}</span>
            <button
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage(currentPage + 1)}
              className="btn btn-sm btn-secondary disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Add Order modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-1 text-[#e8e4dc]">
                {insertGapIndex === null ? 'Add Purchase Order' : 'Insert Purchase Order'}
              </h2>
              {insertGapIndex !== null && (
                <p className="text-xs text-[var(--ax-accent)] mb-4 flex items-center gap-1">
                  <Plus className="w-3 h-3 shrink-0" strokeWidth={2.5} />
                  {insertGapIndex === 0
                    ? `Will be placed before "${orders[0]?.name}"`
                    : insertGapIndex >= orders.length
                    ? `Will be placed after "${orders[orders.length - 1]?.name}"`
                    : `Will be placed between "${orders[insertGapIndex - 1]?.name}" and "${orders[insertGapIndex]?.name}"`}
                </p>
              )}
              <div className={insertGapIndex === null ? 'space-y-4 mt-4' : 'space-y-4'}>
                <div>
                  <label className="label">Purchase Order Name <span className="text-[#e06050]">*</span></label>
                  <input
                    autoFocus
                    type="text"
                    className="input"
                    placeholder="e.g. PO 0 — Foundation"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAddOrder(); }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Start Date</label>
                    <input
                      type="date"
                      className="input text-sm"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">End Date</label>
                    <input
                      type="date"
                      className="input text-sm"
                      value={newEnd}
                      min={newStart || undefined}
                      onChange={(e) => setNewEnd(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-[rgba(232,228,220,0.35)]">
                  Dates are optional. All team members will be notified when the order is created.
                </p>
                {apiError && (
                  <p className="text-sm text-[#e06050]">{apiError}</p>
                )}
                <div className="flex justify-end gap-3 pt-1">
                  <button
                    onClick={() => { setShowAdd(false); setNewName(''); setNewStart(''); setNewEnd(''); setApiError(''); setInsertGapIndex(null); }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleAddOrder()}
                    disabled={adding || !newName.trim()}
                    className="btn btn-primary disabled:opacity-50"
                  >
                    {adding ? (insertGapIndex === null ? 'Creating…' : 'Inserting…') : (insertGapIndex === null ? 'Create Order' : 'Insert Order')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e06050]">Delete Order</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4">
                Are you sure? This cannot be undone.
                {(orders.find((p) => p.id === deleteId)?.boqs.length ?? 0) > 0 && (
                  <span className="block mt-1 text-[rgba(var(--ax-accent-rgb),0.8)] text-sm">
                    The BOQ(s) linked to this order will also be deleted.
                  </span>
                )}
              </p>
              {deleteError && (
                <div className="alert alert-error mb-4 text-sm">{deleteError}</div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setDeleteId(null); setDeleteError(''); }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDelete(deleteId)}
                  disabled={deleting}
                  className="btn bg-[#e06050] text-white hover:bg-[#c8503f] disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportBOQModal
          projectId={projectId}
          orders={orders.map((o) => ({ id: o.id, name: o.name }))}
          onClose={() => setShowImport(false)}
          onImported={() => void refetch()}
        />
      )}
    </div>
  );
}
