import { Skeleton } from './Skeleton';

// One shimmer line
function Line({ w = 'full', h = 'h-4' }: { w?: string; h?: string }) {
  return <Skeleton className={`${h} w-${w}`} />;
}

// A card with shimmer rows inside
export function CardSkeleton({ rows = 3, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div className="card">
      {header && (
        <div className="card-header">
          <Line w="1/3" h="h-5" />
        </div>
      )}
      <div className="card-body space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex justify-between items-center gap-4">
            <Line w="1/2" />
            <Line w="1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

// A table with shimmer rows
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i}><Skeleton className="h-4 w-20" /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, row) => (
              <tr key={row}>
                {Array.from({ length: cols }).map((_, col) => (
                  <td key={col}>
                    <Skeleton className={`h-4 ${col === 0 ? 'w-40' : col === cols - 1 ? 'w-16' : 'w-24'}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// A row of stat cards (dashboard summary)
export function StatRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={`grid gap-4 grid-cols-2 md:grid-cols-${Math.min(count, 6)}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <div className="card-body space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Dashboard page skeleton (stat cards + chart areas + list)
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-48" />
      <StatRowSkeleton count={6} />
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card">
            <div className="card-header"><Skeleton className="h-5 w-32" /></div>
            <div className="card-body">
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      <CardSkeleton rows={5} />
    </div>
  );
}

// Table page skeleton (title + action button + table)
export function TablePageSkeleton({ title = true }: { title?: boolean }) {
  return (
    <div className="space-y-6">
      {title && (
        <div className="flex justify-between items-center">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      )}
      <TableSkeleton rows={7} cols={5} />
    </div>
  );
}

// List of cards (follow-ups, payments, evidence review)
export function ListPageSkeleton({ cards = 5 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card">
            <div className="card-body flex justify-between items-center gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Analysis page skeleton (tabs + content)
export function AnalysisSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-48" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      <StatRowSkeleton count={4} />
      <CardSkeleton rows={6} />
    </div>
  );
}

// Detail page skeleton (milestone detail, evidence)
export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card">
            <div className="card-body space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-32" />
            </div>
          </div>
        ))}
      </div>
      <CardSkeleton rows={4} />
      <CardSkeleton rows={3} />
    </div>
  );
}

// Form page skeleton (new milestone, settings)
export function FormPageSkeleton() {
  return (
    <div className="space-y-6 max-w-2xl">
      <Skeleton className="h-7 w-48" />
      <div className="card">
        <div className="card-body space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Projects list page skeleton (project cards grid)
export function ProjectsListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card">
            <div className="card-body space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <div className="flex justify-between pt-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
