import { Skeleton } from "@shared/ui/Skeleton";

export function GoalsPageSkeleton() {
  return (
    <div className="page-stack">
      <div className="flex justify-end">
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}
