import { getSportConfig } from "@shared/config/sport-config";
import { workoutTypeLabel } from "@features/today/lib/session-label";
import { activityLocalDay, DEFAULT_TIMEZONE } from "@shared/lib/training-day";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

export interface WeekTrainingRow {
  readonly dayKey: string;
  readonly dayLabel: string;
  readonly title: string;
  readonly metric: string;
  readonly isToday: boolean;
  readonly isDone: boolean;
}

export interface WeekTrainingInput {
  readonly events: readonly CalendarEventDTO[];
  readonly activityMap: ReadonlyMap<string, readonly ActivitySummary[]>;
  /** 本周周一 00:00 的日期对象。 */
  readonly weekStart: Date;
  readonly timezone?: string;
  /** 运动员当天的 YYYY-MM-DD。 */
  readonly todayKey: string;
}

const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

function dayKeyAt(weekStart: Date, offsetDays: number): string {
  const [year, month, day] = [
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate(),
  ];
  const date = new Date(Date.UTC(year, month, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

function activityTitle(activity: ActivitySummary): string {
  const sportLabel = getSportConfig(activity.sport).label;
  const minutes = activity.duration_s ? Math.round(activity.duration_s / 60) : null;
  return minutes ? `${sportLabel} ${minutes} 分钟` : sportLabel;
}

function eventTitle(event: CalendarEventDTO): string {
  const name = event.name?.trim();
  if (name) return name;
  const prescription = event.workout_prescription;
  const type = prescription?.type ?? event.sport_type ?? "";
  const typeLabel = workoutTypeLabel(type);
  const minutes = prescription?.duration_min ? Math.round(prescription.duration_min) : null;
  return minutes ? `${typeLabel} ${minutes} 分钟` : typeLabel;
}

/**
 * 把这一周的已完成活动与课表排成一行一行的训练清单。
 *
 * 没排训练的日子不占行（除非是今天），保持清单紧凑；整周一条训练都没有时
 * 返回空数组，由外层渲染无安排的提示。
 */
export function buildWeekTrainingRows(input: WeekTrainingInput): WeekTrainingRow[] {
  const { events, activityMap, weekStart, timezone = DEFAULT_TIMEZONE, todayKey } = input;
  const rows: WeekTrainingRow[] = [];

  for (let i = 0; i < 7; i += 1) {
    const dayKey = dayKeyAt(weekStart, i);
    const dayLabel = WEEKDAY_NAMES[i] ?? `第 ${i + 1} 天`;
    const isToday = dayKey === todayKey;
    const activities = activityMap.get(dayKey) ?? [];
    const dayEvents = events.filter(
      (e) => activityLocalDay(e.start_time, timezone) === dayKey,
    );

    if (activities.length > 0) {
      const primary = activities[0]!;
      const totalDuration = activities.reduce((sum, activity) => sum + (activity.duration_s ?? 0), 0);
      const durationMinutes = Math.round(totalDuration / 60);
      rows.push({
        dayKey,
        dayLabel,
        title: activityTitle(primary),
        metric: durationMinutes > 0 ? `${isToday ? "今天 · " : ""}${durationMinutes} 分钟` : "已完成",
        isToday,
        isDone: true,
      });
      continue;
    }

    if (dayEvents.length > 0) {
      const primary = dayEvents[0]!;
      const durationMinutes = primary.workout_prescription?.duration_min;
      rows.push({
        dayKey,
        dayLabel,
        title: eventTitle(primary),
        metric: durationMinutes != null
          ? `${isToday ? "今天 · " : ""}${Math.round(durationMinutes)} 分钟`
          : isToday ? "今天 · 计划中" : "计划中",
        isToday,
        isDone: false,
      });
      continue;
    }

    if (isToday) {
      rows.push({
        dayKey,
        dayLabel,
        title: "休息",
        metric: "今天",
        isToday: true,
        isDone: false,
      });
    }
  }

  return rows;
}
