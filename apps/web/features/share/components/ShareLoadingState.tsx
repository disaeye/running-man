import { Card } from "@shared/ui/Card";
import { Skeleton } from "@shared/ui/Skeleton";

import { ShareShell } from "./ShareShell";

export function ShareLoadingState() {
  return (
    <ShareShell>
      <Card padding="lg" className="w-full max-w-2xl space-y-5" aria-busy="true" aria-label="正在加载活动">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 md:grid-cols-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </Card>
    </ShareShell>
  );
}
