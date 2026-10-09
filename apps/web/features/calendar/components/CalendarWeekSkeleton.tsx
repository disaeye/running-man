import { Card } from "@shared/ui/Card";
import { Skeleton } from "@shared/ui/Skeleton";

/** Reserve the final grid dimensions during SWR loading to eliminate CLS.
 *  Matches PlanWeekView layout: Card with header bar + 7-column grid. */
export function CalendarWeekSkeleton() {
  return (
    <Card padding="sm">
      <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton variant="circular" width={32} height={32} />
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[480px] grid-cols-7 gap-2 p-3">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface-card p-2"
              data-testid="plan-week-skeleton-cell"
            >
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3 w-5" />
              <Skeleton variant="rectangular" className="mt-1 h-14 w-full rounded" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
