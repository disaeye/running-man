/**
 * 四格读数：今天这节课的四个口径。
 *
 * 四个格子并排，对照配速、准备状态与本周训练进度。
 * 这是参考稿的第二视觉层——四个数在一条线上，读者先拿到四个口径的对照，
 * 再往下看面板里的曲线与明细。
 *
 * 读数本身不重新取数：全部来自页面已经拿到的三份数据（recommendation、
 * readiness、本周汇总），所以这一层是纯函数。
 */

import { formatPaceFromSeconds } from "@shared/lib/format";
import { activityLocalDay } from "@shared/lib/training-day";
import { workoutTypeLabel } from "@features/today/lib/session-label";
import type { Reading } from "@shared/ui/ReadingStrip";
import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { matchDayEvents } from "@features/calendar/lib/match";
import type { ActivitySummary } from "@shared/types/activity";

export interface ReadingInput {
  readonly decision: CoachRecommendation | null;
  /** 心率上限数值（次/分）。 */
  readonly heartRateCap?: number | null;
  /** 心率上限的区间说明，例如「Z2 上沿」「处方指定」。 */
  readonly heartRateNote?: string | null;
  /** 准备度分数。 */
  readonly score: number | null;
  /** 准备度分档的可读标签。 */
  readonly levelLabel: string | null;
  /** 这次评估有没有测到东西。 */
  readonly dataSufficient: boolean;
  /** 本周计划课次。 */
  readonly plannedSessions: number | null;
  /** 本周已完成课次。 */
  readonly actualSessions: number | null;
  /** 本周已完成的课次。 */
  readonly completed: number | null;
  /** 周序号，写在「本周课次」那格的补充里。 */
  readonly weekLabel: string;
}

export function homeReadings(input: ReadingInput): Reading[] {
  const pace = input.decision?.pace_targets ?? null;
  const paceText = pace
    ? `${formatPaceFromSeconds(pace.min_s_per_km)}–${formatPaceFromSeconds(pace.max_s_per_km)}`
    : null;
  const weeklyText =
    input.plannedSessions != null && input.actualSessions != null
      ? `${input.actualSessions} / ${input.plannedSessions}`
      : null;
  const intensity = pace?.intensity ?? null;

  return [
    {
      label: "配速",
      value: paceText,
      unit: paceText ? "/km" : null,
      note: intensity ? `强度 ${workoutTypeLabel(intensity)}` : null,
    },
    {
      label: "训练进度",
      value: weeklyText,
      unit: weeklyText ? "节" : null,
      note: `本周已完成 / 计划 ${weeklyText ?? "未记录"}`,
    },
    {
      label: "心率上限",
      value: input.heartRateCap != null ? String(Math.round(input.heartRateCap)) : null,
      unit: input.heartRateCap != null ? "次 / 分" : null,
      note: input.heartRateNote ?? (input.dataSufficient ? input.levelLabel : null),
    },
    {
      label: "本周课次",
      value: input.completed != null ? String(input.completed) : null,
      unit: input.completed != null ? "节" : null,
      note: input.weekLabel || null,
    },
  ];
}

export function addIsoDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}

/** Match today's calendar workouts against today's activities without letting another sport hide pending plans. */
export function resolveTodayWorkoutState(
  events: readonly CalendarEventDTO[],
  todayActivities: readonly ActivitySummary[],
  timezone: string,
  todayKey: string,
) {
  const activeToday = events.filter(
    (event) =>
      event.status !== "deleted" &&
      event.training_type !== "race" &&
      activityLocalDay(event.start_time, timezone) === todayKey,
  );
  const matches = matchDayEvents(todayKey, todayKey, activeToday, todayActivities);
  const pending = activeToday.find((event) => {
    const st = matches.get(event.event_id)?.status;
    return (st === "upcoming" || st === "missed") && event.workout_prescription;
  });
  if (pending) {
    return { todayEvent: pending, completedToday: null, otherCompletedCount: todayActivities.length };
  }
  const firstWithPrescription = activeToday.find((event) => event.workout_prescription) ?? null;
  const matchedActId = firstWithPrescription ? matches.get(firstWithPrescription.event_id)?.activityId : null;
  const matchedAct = matchedActId
    ? (todayActivities.find((a) => a.activity_id === matchedActId) ?? todayActivities[0] ?? null)
    : (todayActivities[0] ?? null);
  const remaining = matchedAct
    ? todayActivities.filter((a) => a.activity_id !== matchedAct.activity_id).length
    : 0;
  return { todayEvent: firstWithPrescription, completedToday: matchedAct, otherCompletedCount: remaining };
}
