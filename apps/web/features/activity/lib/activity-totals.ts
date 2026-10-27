import type { Reading } from "@shared/ui/ReadingStrip";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatDistance, formatDuration } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";

/** The four numbers that describe whatever the current filter selects. */
export function buildActivityTotals(activities: readonly ActivitySummary[]): Reading[] {
  const distance = activities.reduce((sum, item) => sum + (item.distance_m ?? 0), 0);
  const duration = activities.reduce((sum, item) => sum + (item.duration_s ?? 0), 0);
  const load = activities.reduce((sum, item) => sum + (item.tss ?? 0), 0);

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
      label: "负荷",
      value: activities.length > 0 ? String(Math.round(load)) : NO_VALUE,
      unit: "TSS",
    },
  ];
}
