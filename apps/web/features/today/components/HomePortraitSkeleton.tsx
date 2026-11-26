import { Skeleton } from "@shared/ui/Skeleton";

function CardSkeleton({ children, className = "" }: { readonly children: React.ReactNode; readonly className?: string }) {
  return (
    <div className={`rounded-2xl border border-border-subtle p-4 sm:p-5 ${className}`.trim()}>
      {children}
    </div>
  );
}

function MetricCellSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="h-7 w-20" />
    </div>
  );
}

/** 与 VerdictCard 同结构：眉标、结论标题、四格读数、依据槽、右对齐行动按钮。 */
function WorkoutSkeleton() {
  return (
    <CardSkeleton className="border-l-[3px] border-l-accent-strong">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-2 h-7 w-48 sm:h-9" />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <MetricCellSkeleton key={index} />
        ))}
      </div>
      <div className="mt-3 space-y-2 rounded-xl bg-surface-overlay p-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <div className="mt-3 flex justify-end">
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
    </CardSkeleton>
  );
}

/** 与 LovableRecovery 同结构：就绪环 + 判定行、四格读数带、影响因子按钮行。 */
function RecoverySkeleton() {
  return (
    <CardSkeleton>
      <div className="flex items-center gap-3.5">
        <div className="skeleton-shimmer size-[72px] shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 sm:grid-cols-4 sm:gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-border-subtle pt-2">
        <Skeleton className="h-11 w-full" />
      </div>
    </CardSkeleton>
  );
}

function LoadSkeleton() {
  return (
    <CardSkeleton>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-4 w-48" />
    </CardSkeleton>
  );
}

/** 与 LovableWeekProgress 同结构：标题行、主进度条与并列读数、七日状态圆点。 */
function WeekSkeleton() {
  return (
    <CardSkeleton>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="flex-1 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        <div className="flex shrink-0 gap-5 border-t border-border-subtle pt-2.5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-7 gap-1 border-t border-border-subtle pt-3">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex flex-col items-center gap-1 py-0.5">
            <Skeleton className="h-3 w-3" />
            <div className="skeleton-shimmer size-5 rounded-full" />
            <Skeleton className="h-3 w-4" />
          </div>
        ))}
      </div>
    </CardSkeleton>
  );
}

/**
 * 首页骨架：与真实仪表盘同一栅格、同一卡片数量、同一内部结构，
 * 数据到达时各卡片原位替换，版面高度变化最小。
 */
export function HomePortraitSkeleton() {
  return (
    <div
      data-testid="home-skeleton"
      aria-busy="true"
      aria-label="正在加载今日训练概览"
      className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-5"
    >
      <div className="lg:col-span-7 lg:row-start-1">
        <WorkoutSkeleton />
      </div>
      <div className="space-y-4 lg:col-span-5 lg:col-start-8 lg:row-span-3 lg:row-start-1">
        <RecoverySkeleton />
        <LoadSkeleton />
      </div>
      <div className="space-y-4 lg:col-span-7 lg:col-start-1 lg:row-start-2">
        <WeekSkeleton />
      </div>
    </div>
  );
}
