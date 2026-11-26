import { Skeleton } from "@shared/ui/Skeleton";

function SkeletonCard({ rows }: { readonly rows: number }) {
  return (
    <div className="rounded-2xl border border-border-subtle p-5">
      <Skeleton className="h-3 w-20" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className={index % 3 === 2 ? "h-4 w-2/3" : "h-4 w-full"} />
        ))}
      </div>
    </div>
  );
}

/**
 * 路由级加载骨架。
 *
 * 与 `Page` 页头（眉标行 + 标题行 + 右侧操作槽）和标准内容卡的结构保持一致，
 * 这样「路由骨架 → 页面自身骨架 → 数据」三段之间的形状变化最小。
 * 主导航 `<Link prefetch>` 拿到完整 RSC 后，这个骨架只在预取尚未完成时出现。
 */
export default function DashboardLoading() {
  return (
    <div className="page-stack" data-testid="route-loading-skeleton" aria-busy="true" aria-label="正在加载页面">
      <header className="mb-2 space-y-2 border-b border-border-subtle pb-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-end justify-between gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </header>
      <div className="space-y-4">
        <SkeletonCard rows={4} />
        <SkeletonCard rows={2} />
        <SkeletonCard rows={3} />
      </div>
    </div>
  );
}
