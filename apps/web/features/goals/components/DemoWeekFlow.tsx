"use client";

import { Card } from "@shared/ui/Card";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";
import type { ActivePlan, PlanSession } from "@features/goals/hooks/useActivePlan";

/**
 * 展示本周七天的计划训练与完成状态。
 *
 * 每天一行：星期与日期、训练名称、类型标签、具体说明、右侧的距离与状态。
 *
 * 类型标签使用课表记录的训练类型；未知类型不添加标签。
 *
 * 每行显示日期、课程内容和完成状态。
 */

interface Props {
  readonly plan: ActivePlan;
  readonly todayIso: string;
  readonly testId?: string;
}

const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** 课表上的训练类型 → 标签与样式。 */
const TYPE_TAG: Record<string, { label: string; className: string }> = {
  long: { label: "长距离", className: "bg-accent text-on-primary" },
  intervals: { label: "间歇", className: "bg-secondary-container text-on-secondary" },
  tempo: { label: "节奏", className: "bg-secondary-container text-on-secondary" },
  recovery: { label: "恢复", className: "bg-tertiary-dim/20 text-tertiary" },
  easy: { label: "轻松", className: "bg-surface-overlay text-text-secondary" },
  rest: { label: "休息", className: "bg-surface-overlay text-text-muted" },
};

export function DemoWeekFlow({
  plan,
  todayIso,
  testId,
}: Props) {
  const sessions = plan.week_sessions;
  const byDay = new Map<string, PlanSession[]>();
  for (const session of sessions) {
    const bucket = byDay.get(session.date);
    if (bucket) bucket.push(session);
    else byDay.set(session.date, [session]);
  }

  const start = plan.week_start;
  const days = start
    ? Array.from({ length: 7 }, (_, index) => addDays(start, index))
    : [];

  const sessionCount = sessions.length;
  const restCount = Math.max(0, 7 - sessionCount);
  const longCount = sessions.filter((session) => session.training_type === "long").length;

  return (
    <Card data-testid={testId ?? "demo-week-flow"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-title3 font-semibold text-text-primary">
            本周训练安排
          </h2>
          <p className="mt-0.5 text-caption1 text-text-muted">
            {plan.week_start && plan.week_end
              ? `${plan.week_start} — ${plan.week_end}`
              : "本周"}
            {plan.week_planned_distance_m != null
              ? ` · 计划 ${(plan.week_planned_distance_m / 1000).toFixed(1)} km`
              : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-overlay px-2.5 py-1 font-mono text-caption1 text-text-secondary">
          {sessionCount} 次训练 · {restCount} 天休息 · {longCount} 次长距离
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {days.map((day) => {
          const daySessions = byDay.get(day) ?? [];
          const isToday = day === todayIso;
          const first = daySessions[0] ?? null;
          const tag = first ? TYPE_TAG[first.training_type ?? ""] ?? null : null;
          const distanceKm =
            first?.predicted_distance_m != null
              ? first.predicted_distance_m / 1000
              : null;

          return (
            <div
              key={day}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${
                isToday ? "bg-surface-active" : "bg-surface-overlay"
              }`}
              data-testid={`demo-week-day-${day}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-raised font-mono">
                  <span className="text-caption2 text-text-muted">
                    {WEEKDAY_NAMES[dayIndex(day)] ?? ""}
                  </span>
                  <span className="font-display text-subheadline leading-none text-text-primary">
                    {dayNumber(day)}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-subheadline text-text-primary">
                      {first?.title ?? "休息日"}
                    </span>
                    {tag ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-caption2 ${tag.className}`}
                      >
                        {tag.label}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-caption1 text-text-muted">
                    {first ? sessionDetail(first) : "不安排训练"}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                {distanceKm != null ? (
                  <p className="font-mono text-title2 leading-none tabular-nums text-text-primary">
                    {distanceKm.toFixed(1)}
                    <span className="ml-0.5 text-caption1 text-text-muted">km</span>
                  </p>
                ) : first ? (
                  <p className="font-mono text-caption1 tabular-nums text-text-muted">
                    {first.duration_min != null ? `${first.duration_min} 分钟` : NO_VALUE}
                  </p>
                ) : null}
                {first?.is_completed ? (
                  <p className="mt-1 font-mono text-caption1 text-accent">已完成</p>
                ) : isToday ? (
                  <p className="mt-1 font-mono text-caption1 text-accent">今天</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * 一节训练的说明行：配速区间或时长。
 */
function sessionDetail(session: PlanSession): string {
  if (session.pace_min_s_km != null && session.pace_max_s_km != null) {
    return `目标配速 ${formatPaceFromSeconds(session.pace_min_s_km)}–${formatPaceFromSeconds(session.pace_max_s_km)}/km`;
  }
  if (session.duration_min != null) {
    return `${session.duration_min} 分钟`;
  }
  return "课表已安排";
}

/** 星期几（0 = 周一）。 */
function dayIndex(iso: string): number {
  const date = new Date(`${iso}T00:00:00`);
  return (date.getDay() + 6) % 7;
}

function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
