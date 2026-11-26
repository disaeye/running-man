import { activityLocalDay } from "@shared/lib/training-day";
import type { ActivitySummary } from "@shared/types/activity";
import { getSportConfig, type SportFamily } from "@shared/config/sport-config";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { groupTrainingByDay } from "./training-calendar";
import { matchDayEvents, type DayEventMatch } from "./match";

export type MetricKey = "sessions" | "distanceKm" | "durationMin" | "tss";

export interface MetricComparison {
  readonly planned: number;
  readonly actual: number;
  readonly delta: number;
}

export interface PeriodComparison {
  readonly from: string;
  readonly to: string;
  readonly family: SportFamily | "all";
  readonly hasPlan: boolean;
  readonly metrics: Record<MetricKey, MetricComparison>;
  readonly plannedKnown: Record<MetricKey, boolean>;
  readonly actualKnown: Record<MetricKey, boolean>;
}

export type DayState =
  | "completed"
  | "partial"
  | "upcoming"
  | "missed"
  | "unplanned"
  | "empty";

export interface WeekDay {
  readonly day: string;
  readonly activities: readonly ActivitySummary[];
  readonly events: readonly CalendarEventDTO[];
  readonly eventMatches: ReadonlyMap<string, DayEventMatch>;
  readonly state: DayState;
  readonly isToday: boolean;
  readonly planned: MetricComparison | null;
  readonly actual: MetricComparison | null;
}

export interface WeekModel {
  readonly days: readonly WeekDay[];
  readonly comparison: PeriodComparison;
  readonly missingSessions: readonly string[];
}

/** 计划的运动类别走同一注册表；认不出来时按全部处理。 */
export function eventFamily(event: CalendarEventDTO): SportFamily | "all" {
  if (!event.sport_type) return "all";
  const family = getSportConfig(event.sport_type).family;
  return family === "unknown" ? "all" : family;
}

function matches(
  family: SportFamily | "all",
  activityFamily: SportFamily,
  event: CalendarEventDTO | null,
): boolean {
  if (family === "all") return true;
  if (event === null) return activityFamily === family;
  return eventFamily(event) === family || eventFamily(event) === "all";
}

function plannedMetrics(events: readonly CalendarEventDTO[]): MetricComparison {
  return {
    planned: events.length,
    actual: 0,
    delta: 0,
  };
}

function sumActual(activities: readonly ActivitySummary[]): Record<MetricKey, number> {
  return {
    sessions: activities.length,
    distanceKm: activities.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 1000,
    durationMin: activities.reduce((sum, a) => sum + (a.duration_s ?? 0), 0) / 60,
    tss: activities.reduce((sum, a) => sum + (a.tss ?? 0), 0),
  };
}

function sumPlanned(events: readonly CalendarEventDTO[]): Record<MetricKey, number> {
  return {
    sessions: events.length,
    distanceKm: events.reduce((sum, e) => sum + (e.predicted_distance_m ?? 0), 0) / 1000,
    durationMin: events.reduce(
      (sum, e) => sum + (e.workout_prescription?.duration_min ?? 0),
      0,
    ),
    tss: events.reduce((sum, e) => sum + (e.predicted_tss ?? 0), 0),
  };
}

function resolveKnownActual(activities: readonly ActivitySummary[]): Record<MetricKey, boolean> {
  if (activities.length === 0) {
    return { sessions: true, distanceKm: true, durationMin: true, tss: true };
  }
  return {
    sessions: true,
    distanceKm: activities.some((a) => a.distance_m != null),
    durationMin: activities.some((a) => a.duration_s != null),
    tss: activities.some((a) => a.tss != null),
  };
}

function resolveKnownPlanned(events: readonly CalendarEventDTO[]): Record<MetricKey, boolean> {
  if (events.length === 0) {
    return { sessions: false, distanceKm: false, durationMin: false, tss: false };
  }
  return {
    sessions: true,
    distanceKm: events.some((e) => e.predicted_distance_m != null),
    durationMin: events.some((e) => e.workout_prescription?.duration_min != null),
    tss: events.some((e) => e.predicted_tss != null),
  };
}

/**
 * 本周执行模型。
 *
 * 四个指标共享同一日期范围与同一运动类别口径；计划来自课表，实际来自活动。
 * 没有计划的周保留「未编排」语义，差值不补零。
 */
export function buildWeekModel({
  activities,
  events,
  timezone,
  from,
  to,
  today,
  family = "all",
  includeEmptyDays = false,
}: {
  readonly activities: readonly ActivitySummary[];
  readonly events: readonly CalendarEventDTO[];
  readonly timezone: string;
  readonly from: string;
  readonly to: string;
  readonly today: string;
  readonly family?: SportFamily | "all";
  readonly includeEmptyDays?: boolean;
}): WeekModel {
  const allDays = enumerateDays(from, to);
  const grouped = groupTrainingByDay(activities, events, timezone);
  const scopedActivities = activities.filter((a) => {
    const day = activityLocalDay(a.start_time, timezone);
    return from <= day && day <= to && matches(family, getSportConfig(a.sport).family, null);
  });
  const scopedEvents = events.filter((e) => {
    const day = activityLocalDay(e.start_time, timezone);
    return from <= day && day <= to && e.status !== "deleted" && matches(family, "running", e);
  });

  const planned = sumPlanned(scopedEvents);
  const actual = sumActual(scopedActivities);
  const keys: readonly MetricKey[] = ["sessions", "distanceKm", "durationMin", "tss"];
  const metrics = Object.fromEntries(
    keys.map((key) => [
      key,
      { planned: planned[key], actual: actual[key], delta: actual[key] - planned[key] },
    ]),
  ) as Record<MetricKey, MetricComparison>;

  const days: WeekDay[] = [];
  const missingSessions: string[] = [];

  for (const day of allDays) {
    const items = grouped.get(day);
    const dayActivities = (items?.activities ?? []).filter((a) =>
      matches(family, getSportConfig(a.sport).family, null),
    );
    const dayEvents = (items?.events ?? []).filter((e) =>
      matches(family, "running", e),
    );
    const isToday = day === today;
    const hasContent = dayActivities.length > 0 || dayEvents.length > 0 || isToday;
    if (!hasContent && !includeEmptyDays) continue;

    const eventMatches = matchDayEvents(day, today, dayEvents, dayActivities);
    const state = resolveDayState(day, today, dayActivities, dayEvents, eventMatches);
    for (const event of dayEvents) {
      const match = eventMatches.get(event.event_id);
      if (match?.status === "missed") {
        missingSessions.push(event.name || event.training_type || "计划课");
      }
    }
    days.push({
      day,
      activities: dayActivities,
      events: dayEvents,
      eventMatches,
      state,
      isToday,
      planned: dayEvents.length ? plannedMetrics(dayEvents) : null,
      actual: dayActivities.length
        ? { planned: 0, actual: sumActual(dayActivities).sessions, delta: 0 }
        : null,
    });
  }

  return {
    days,
    comparison: {
      from,
      to,
      family,
      hasPlan: scopedEvents.length > 0,
      metrics,
      plannedKnown: resolveKnownPlanned(scopedEvents),
      actualKnown: resolveKnownActual(scopedActivities),
    },
    missingSessions,
  };
}

function resolveDayState(
  day: string,
  today: string,
  activities: readonly ActivitySummary[],
  events: readonly CalendarEventDTO[],
  eventMatches: ReadonlyMap<string, DayEventMatch>,
): DayState {
  if (events.length === 0) {
    if (activities.length > 0) return "completed";
    return day === today ? "unplanned" : "empty";
  }
  const statuses = events.map((e) => eventMatches.get(e.event_id)?.status ?? "upcoming");
  if (statuses.every((s) => s === "completed")) return "completed";
  if (statuses.some((s) => s === "completed" || s === "partial")) return "partial";
  return day < today ? "missed" : "upcoming";
}

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  const [year, month, date] = from.split("-").map(Number) as [number, number, number];
  const [endYear, endMonth, endDate] = to.split("-").map(Number) as [number, number, number];
  const start = Date.UTC(year, month - 1, date);
  const end = Date.UTC(endYear, endMonth - 1, endDate);
  for (let time = start; time <= end; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/** 负荷档位按近 8 周全部有值日的分位固定，跨月不漂移。 */
export function loadScale(thresholds: readonly number[]): (tss: number) => number {
  const sorted = [...thresholds].filter((value) => value > 0).sort((a, b) => a - b);
  const cut = (ratio: number): number =>
    sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
  const bounds = [cut(0.25), cut(0.5), cut(0.75), cut(0.9)];
  return (tss: number): number => {
    if (tss <= 0) return 0;
    let level = 1;
    for (const bound of bounds) if (tss > bound) level += 1;
    return Math.min(4, level);
  };
}

export function periodLabel(from: string, to: string): string {
  return `${from.slice(5)} – ${to.slice(5)}`;
}

export function monthLabel(monthKey: string): string {
  return `${monthKey.slice(0, 4)} 年 ${Number(monthKey.slice(5))} 月`;
}
