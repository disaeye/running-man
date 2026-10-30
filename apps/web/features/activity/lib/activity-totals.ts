import type { Reading } from "@shared/ui/ReadingStrip";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatDistance, formatDuration, formatHeartRate } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The four numbers that describe whatever the current filter selects. */
export function buildActivityTotals(activities: readonly ActivitySummary[]): Reading[] {
  const distance = activities.reduce((sum, item) => sum + (item.distance_m ?? 0), 0);
  const duration = activities.reduce((sum, item) => sum + (item.duration_s ?? 0), 0);

  return [
    {
      label: "次数",
      value: activities.length > 0 ? String(activities.length) : "0",
      unit: "次",
    },
    {
      label: "距离",
      value: activities.length > 0 ? formatDistance(distance) : NO_VALUE,
    },
    {
      label: "时长",
      value: activities.length > 0 ? formatDuration(duration) : NO_VALUE,
    },
    {
      label: "平均心率",
      value: activities.length > 0
        ? formatHeartRate(average(activities.flatMap((item) => item.avg_hr == null ? [] : [item.avg_hr])))
        : NO_VALUE,
    },
  ];
}
