import { PageCard } from "@shared/ui/Card";
import { Skeleton } from "@shared/ui/Skeleton";

export function ActivityDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="正在加载活动详情" data-testid="activity-detail-skeleton">
      <PageCard>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </PageCard>
      <PageCard>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
        </div>
      </PageCard>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <PageCard className="space-y-3 lg:col-span-7">
          <Skeleton className="h-52 w-full" />
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}
        </PageCard>
        <PageCard className="space-y-3 lg:col-span-5">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
        </PageCard>
      </div>
    </div>
  );
}
