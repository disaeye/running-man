import type { ActivitySummary } from "@shared/types/activity";
import { SessionCard } from "@features/activity/components/SessionCard";
import { useSessionClassifications } from "@features/activity/hooks/useSessionClassifications";
import { ActivityTable } from "@features/activity/components/ActivityTable";
import type { ViewMode } from "@features/activity/components/ViewToggle";
import { EmptyState } from "@shared/ui/EmptyState";
import { ProportionBar } from "@shared/ui/ProportionBar";
import { Button } from "@shared/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { largestRemainderPercent } from "@shared/lib/format";
import { getSportConfig, isProductSport, type SportFamily } from "@shared/config/sport-config";
import { activityLocalDay, useAthleteTimezoneState } from "@shared/lib/training-day";
export interface ActivitiesContentProps {
  activities: ActivitySummary[];
  from?: string;
  to?: string;
  loading: boolean;
  error: string | null;
  viewMode: ViewMode;
  returnTo: string;
  onRetry?: () => void;
}

export function ActivitiesContent({
  activities,
  from,
  to,
  loading,
  error,
  viewMode,
  returnTo,
  onRetry,
}: ActivitiesContentProps) {
  const classifications = useSessionClassifications(from, to);
  const { timezone } = useAthleteTimezoneState();
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
  // 跑步与力量家族支持详情展示；骑行家族不在此页（与项目筛选口径一致）。
  const supportedActivities = activities.filter((activity) =>
    isProductSport(activity.sport),
  );
  if (supportedActivities.length === 0) {
    return <EmptyState title="暂无活动记录" description="所选范围内没有符合条件的活动，请调整筛选条件或上传活动数据。" />;
  }
  const sportBar = buildSportSegments(supportedActivities);
  const groupedActivities = new Map<string, ActivitySummary[]>();
  for (const activity of supportedActivities) {
    const day = activityLocalDay(activity.start_time, timezone);
    const group = groupedActivities.get(day) ?? [];
    group.push(activity);
    groupedActivities.set(day, group);
  }
  const content = viewMode === "table" ? (
    <ActivityTable
      activities={supportedActivities}
      classifications={classifications.byActivityId}
      loading={false}
      error={null}
    />
  ) : (
    <div className="space-y-5" data-testid="activity-session-list">
      {[...groupedActivities].map(([day, group]) => (
        <section key={day} aria-label={day || "日期未记录"}>
          <h2 className="num px-1 pb-2 font-mono text-subheadline font-semibold text-text-secondary">{day || "日期未记录"}</h2>
          <div className="space-y-3">
            {group.map((activity) => (
              <SessionCard
                key={activity.activity_id}
                activity={activity}
                classification={classifications.byActivityId.get(activity.activity_id) ?? null}
                returnTo={returnTo}
                showRoute
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
  if (sportBar.length <= 1) return content;
  return (
    <div className="space-y-3">
      <div className="border-t border-border-subtle px-3 py-2.5">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-caption1 text-text-secondary">
          <span className="font-medium">运动类型占比</span>
          <span className="num flex flex-wrap items-center gap-3 tabular-nums">
            {sportBar.map((seg) => (
              <span key={seg.key} className="inline-flex items-center gap-1.5">
                <span className={`inline-block size-2 rounded-full ${seg.colorClass}`} aria-hidden="true" />
                <span>{seg.label} {seg.pct}%</span>
              </span>
            ))}
          </span>
        </div>
        <ProportionBar segments={sportBar} showGrid={false} ariaLabel="运动类型占比" />
      </div>
      {content}
    </div>
  );
}

const FAMILY_META: Partial<Record<SportFamily, { label: string; colorClass: string }>> = {
  running: { label: "跑步", colorClass: "bg-sport-run" },
  strength: { label: "力量训练", colorClass: "bg-sport-workout" },
};

function buildSportSegments(activities: readonly ActivitySummary[]) {
  const counts = new Map<SportFamily, number>();
  for (const activity of activities) {
    const family = getSportConfig(activity.sport).family;
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  const entries = [...counts.entries()];
  const pcts = largestRemainderPercent(entries.map(([, count]) => count));
  return entries.map(([family, count], index) => {
    const meta = FAMILY_META[family] ?? { label: family, colorClass: "bg-text-muted" };
    return {
      key: family,
      label: meta.label,
      pct: pcts[index] ?? 0,
      colorClass: meta.colorClass,
      subLabel: `${count} 次`,
    };
  });
}
