import { useState } from "react";
import Link from "next/link";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { getSportConfig, type SportFamily } from "@shared/config/sport-config";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";
import { activityLocalDay } from "@shared/lib/training-day";
import { useSessionClassifications } from "@features/activity/hooks/useSessionClassifications";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { listLabel } from "../lib/training-week";

const PAGE_SIZE = 30;
export const LIST_WINDOW_DAYS = 90;
const WINDOW_DAYS = LIST_WINDOW_DAYS;

const FAMILY_FILTERS: readonly { key: SportFamily | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "running", label: "跑步" },
  { key: "strength", label: "力量" },
];

/** 全部活动流水：保持列表扫读本质，仅展示日期、运动、名称、四核心读数与一句课型摘要。 */
export function TrainingActivityList({ activities, timezone, days, onLoadEarlier }: {
  activities: readonly ActivitySummary[];
  timezone: string;
  days: number;
  onLoadEarlier: () => void;
}) {
  const [family, setFamily] = useState<SportFamily | "all">("all");
  const [raceOnly, setRaceOnly] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const { byActivityId } = useSessionClassifications();

  const rows = [...activities]
    .filter((activity) => family === "all" || getSportConfig(activity.sport).family === family)
    .filter((activity) => !raceOnly || activity.is_race === true)
    .sort((a, b) => b.start_time.localeCompare(a.start_time));

  return (
    <PageCard title="全部活动" action={<span className="num text-caption1 text-text-muted">{listLabel(days)}</span>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FAMILY_FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => { setFamily(option.key); setVisible(PAGE_SIZE); }}
            aria-pressed={family === option.key}
            className={`tactile inline-flex min-h-11 items-center rounded-full border px-3.5 text-caption1 ${family === option.key ? "border-primary bg-primary/15 text-accent-strong" : "border-border-default text-text-muted"}`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setRaceOnly((value) => !value); setVisible(PAGE_SIZE); }}
          aria-pressed={raceOnly}
          className={`tactile inline-flex min-h-11 items-center rounded-full border px-3.5 text-caption1 ${raceOnly ? "border-primary bg-primary/15 text-accent-strong" : "border-border-default text-text-muted"}`}
        >
          比赛
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted" data-testid="activity-list-empty">这段范围没有符合条件的活动。</p>
      ) : (
        <div className="space-y-1" data-testid="activity-list">
          {rows.slice(0, visible).map((activity) => {
            const classification = byActivityId.get(activity.activity_id);
            const summaryLine = classificationSummary(classification);
            return (
              <Link
                key={activity.activity_id}
                href={`/activities/${activity.activity_id}`}
                className="tactile flex min-h-11 items-center gap-3 rounded-xl p-3 hover:bg-secondary/60"
              >
                <div className="num w-12 shrink-0 text-xs text-text-muted">
                  {activityLocalDay(activity.start_time, timezone).slice(5)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Tag tone="primary">{getSportConfig(activity.sport).label}</Tag>
                    {activity.is_race ? <Tag>比赛</Tag> : null}
                    <span className="truncate text-sm font-medium">
                      {activity.name?.trim() || getSportConfig(activity.sport).label}
                    </span>
                  </div>
                  <div className="num mt-1 flex flex-wrap gap-3 text-xs text-text-muted">
                    {activity.distance_m != null ? <span>{(activity.distance_m / 1000).toFixed(2)} km</span> : null}
                    <span>{formatDuration(activity.duration_s)}</span>
                    {activity.avg_speed ? <span>{formatPaceFromSeconds(Math.round(1000 / activity.avg_speed))}/km</span> : null}
                  </div>
                  {summaryLine ? (
                    <p className="mt-1 line-clamp-1 text-caption1 text-text-secondary" data-testid="activity-list-course">
                      {summaryLine}
                    </p>
                  ) : null}
                </div>
                <span className="num shrink-0 text-xs text-text-muted">
                  {activity.tss != null ? `TSS ${Math.round(activity.tss)}` : `TSS ${NO_VALUE}`}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {visible < rows.length ? (
          <button type="button" onClick={() => setVisible((value) => value + PAGE_SIZE)} className="tactile min-h-11 text-caption1 text-accent-strong hover:underline">
            显示更多（还有 {rows.length - visible} 条）
          </button>
        ) : <span />}
        <button type="button" onClick={onLoadEarlier} className="tactile min-h-11 text-caption1 text-accent-strong hover:underline">
          加载更早 {WINDOW_DAYS} 天
        </button>
      </div>
    </PageCard>
  );
}

function classificationSummary(
  item: ReturnType<typeof useSessionClassifications>["byActivityId"] extends ReadonlyMap<string, infer T> ? T | undefined : never,
): string | null {
  if (!item) return null;
  const name = item.session_classification.display_name?.trim();
  if (!name) return null;
  const workMatch = item.quality.work_distance_match;
  if (workMatch != null) {
    return `${name} · 计划完成度 ${Math.round(workMatch * 100)}%`;
  }
  return name;
}
