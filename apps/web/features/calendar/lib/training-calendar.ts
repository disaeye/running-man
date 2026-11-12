import { activityLocalDay } from "@shared/lib/training-day";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

export interface TrainingDayItems {
  readonly activities: readonly ActivitySummary[];
  readonly events: readonly CalendarEventDTO[];
}

export type TrainingDayStatus = "empty" | "planned" | "completed" | "mixed";

/** 按运动员当地日期整理全部活动与有效计划，每天按开始时间先后排列。 */
export function groupTrainingByDay(
  activities: readonly ActivitySummary[],
  events: readonly CalendarEventDTO[],
  timezone: string,
): Map<string, TrainingDayItems> {
  const grouped = new Map<string, { activities: ActivitySummary[]; events: CalendarEventDTO[] }>();
  const itemsFor = (day: string): { activities: ActivitySummary[]; events: CalendarEventDTO[] } => {
    const existing = grouped.get(day);
    if (existing) return existing;
    const created = { activities: [], events: [] } as { activities: ActivitySummary[]; events: CalendarEventDTO[] };
    grouped.set(day, created);
    return created;
  };

  for (const activity of activities) {
    itemsFor(activityLocalDay(activity.start_time, timezone)).activities.push(activity);
  }
  for (const event of events) {
    if (event.status === "deleted") continue;
    itemsFor(activityLocalDay(event.start_time, timezone)).events.push(event);
  }
  for (const items of grouped.values()) {
    items.activities.sort((a, b) => a.start_time.localeCompare(b.start_time));
    items.events.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return grouped;
}

export function trainingDayStatus(
  items: { readonly activities: readonly unknown[]; readonly events: readonly unknown[] } | undefined,
): TrainingDayStatus {
  const completed = (items?.activities.length ?? 0) > 0;
  const planned = (items?.events.length ?? 0) > 0;
  if (completed && planned) return "mixed";
  if (completed) return "completed";
  if (planned) return "planned";
  return "empty";
}
