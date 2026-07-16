'use client';

/** Numbered pagination with ellipsis-collapsed page runs (1 … 4 5 6 … 12), a "Showing X–Y of Z"
 * caption, and Prev/Next. Shared by the Activities page's "All Activities" table and its
 * per-status tabs so a large bucket (e.g. 300+ overdue activities) never renders as one long
 * unpaginated scroll. */
export default function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between py-2">
      <p className="text-sm text-[rgba(232,228,220,0.45)]">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="btn btn-sm btn-secondary disabled:opacity-40"
        >
          ← Prev
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | '…')[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === '…' ? (
              <span key={`ellipsis-${i}`} className="px-2 text-[rgba(232,228,220,0.3)] text-sm">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p as number)}
                className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-secondary'}`}
              >
                {p}
              </button>
            )
          )}
        <button
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          className="btn btn-sm btn-secondary disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
