"use client";

import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { activityLocalDay } from "@shared/lib/training-day";

/** 月历图例：四种训练类型的色点。 */
export function DemoLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 font-mono text-caption1 text-text-muted">
      <span className="flex items-center gap-1">
        <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
        耐力长距离
      </span>
      <span className="flex items-center gap-1">
        <span aria-hidden="true" className="size-2 rounded-full bg-secondary-container" />
        间歇 / 阈值
      </span>
      <span className="flex items-center gap-1">
        <span aria-hidden="true" className="size-2 rounded-full bg-tertiary-dim" />
        恢复跑
      </span>
      <span className="flex items-center gap-1">
        <span aria-hidden="true" className="size-2 rounded-full bg-surface-active" />
        休整
      </span>
      <span className="ml-auto">今日：{todayLabel()}</span>
    </div>
  );
}

/** 月份内训练数据汇总。 */
export function monthTotalsFor(
  events: readonly CalendarEventDTO[],
  activityMap: ReadonlyMap<string, readonly ActivitySummary[]>,
  monthDate: Date,
  timezone: string,
): {
  actualDistanceM: number | null;
  plannedDistanceM: number | null;
  completedSessions: number | null;
  plannedSessions: number | null;
  elevationM: number | null;
} {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const inMonth = (iso: string): boolean => {
    const [y, m] = iso.split("-").map(Number);
    return y === year && m === month + 1;
  };

  let plannedDistance = 0;
  let plannedSessions = 0;
  for (const event of events) {
    if (!inMonth(activityLocalDay(event.start_time, timezone))) continue;
    plannedSessions += 1;
    plannedDistance += event.predicted_distance_m ?? 0;
  }

  let actualDistance = 0;
  let actualSessions = 0;
  let elevation = 0;
  for (const [day, activities] of activityMap) {
    if (!inMonth(day)) continue;
    actualSessions += activities.length;
    for (const activity of activities) {
      actualDistance += activity.distance_m ?? 0;
      elevation += activity.elevation_gain_m ?? 0;
    }
  }

  return {
    actualDistanceM: actualSessions > 0 ? actualDistance : null,
    plannedDistanceM: plannedSessions > 0 ? plannedDistance : null,
    completedSessions: actualSessions > 0 ? actualSessions : null,
    plannedSessions: plannedSessions > 0 ? plannedSessions : null,
    elevationM: actualSessions > 0 ? elevation : null,
  };
}

function todayLabel(): string {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}`;
}
