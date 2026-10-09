import type { ActivitySummary } from "@shared/types/activity";
import { SessionCard } from "@features/activity/components/SessionCard";
import { ActivityTable } from "@features/activity/components/ActivityTable";
import type { ViewMode } from "@features/activity/components/ViewToggle";
import { EmptyState } from "@shared/ui/EmptyState";
import { Button } from "@shared/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

export interface ActivitiesContentProps {
  activities: ActivitySummary[];
  loading: boolean;
  error: string | null;
  viewMode: ViewMode;
  onRetry?: () => void;
}

export function ActivitiesContent({
  activities,
  loading,
  error,
  viewMode,
  onRetry,
}: ActivitiesContentProps) {
  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle className="size-8" aria-hidden />}
        title="训练记录加载失败"
        description={error}
        action={onRetry ? <Button variant="secondary" onClick={onRetry}><RotateCcw className="size-4" aria-hidden />重新加载</Button> : undefined}
      />
    );
  }
  if (loading) {
    return <div className="py-12 text-center text-subheadline text-text-muted" role="status" aria-busy="true">加载中...</div>;
  }
  if (activities.length === 0) {
    return <EmptyState title="暂无活动记录" description="所选范围内没有符合条件的活动，请调整筛选条件或上传活动数据。" />;
  }
  if (viewMode === "table") {
    return <ActivityTable activities={activities} loading={false} error={null} />;
  }
  return <div className="flex flex-col gap-3" data-testid="activity-session-list">{activities.map((a) => <SessionCard key={a.activity_id} activity={a} showRoute />)}</div>;
}
