"use client";

import { useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { activityLocalDay, athleteToday, useAthleteTimezone } from "@shared/lib/training-day";
import { buildMonthWeeks } from "@features/plan/lib/month-grid";

/**
 * 月历热力矩阵（参考稿的日历月历）。
 *
 * 每格三样东西：日号、训练类型的色点、当天的里程（计划或实际）。
 *
 * 色点表示训练的类型：耐力长距离、间歇阈值、恢复跑、力量、休息。这套
 * 分类来自课表上的训练类型与实际活动的运动类型，都是已经存在的数据，
 * 不需要新的表。
 *
 * 已完成的日子是实心的，未来计划的日子是淡的，休息日没有点。里程写实际
 * 跑过的距离；未来那天写计划距离，没有计划距离就写「休」。
 */

interface Props {
  readonly events: readonly CalendarEventDTO[];
  readonly monthDate: Date;
  readonly completedActivities?: ReadonlyMap<string, readonly ActivitySummary[]>;
  readonly selectedDate?: string | null;
  readonly onSelectDate: (iso: string) => void;
  readonly testId?: string;
  readonly dayTestIdPrefix?: string;
}

const DAY_HEADER = ["一", "二", "三", "四", "五", "六", "日"];

/** 训练类型 → 色点。参考稿用四种颜色区分训练类型。 */
const TYPE_DOT: Record<string, string> = {
  long: "bg-accent",
  intervals: "bg-secondary-container",
  tempo: "bg-secondary-container",
  recovery: "bg-tertiary-dim",
  easy: "bg-accent",
  strength: "bg-tertiary-fixed",
  rest: "bg-surface-active",
};

export function DemoMonthGrid({
  events,
  monthDate,
  completedActivities,
  selectedDate,
  onSelectDate,
  testId,
  dayTestIdPrefix = "demo-month-day",
}: Props) {
  const timezone = useAthleteTimezone();
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const weeks = useMemo(() => buildMonthWeeks(year, month), [year, month]);
  const today = athleteToday(timezone);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventDTO[]>();
    for (const event of events) {
      const key = activityLocalDay(event.start_time, timezone);
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [events, timezone]);

  return (
    <Card padding="md" data-testid={testId ?? "demo-month-grid"}>
      <div className="grid grid-cols-7 pb-2 text-center">
        {DAY_HEADER.map((day) => (
          <span key={day} className="text-caption1 text-text-muted">
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {weeks.flat().map(({ date, inMonth }) => {
          const iso = toIso(date);
          if (!inMonth) {
            return (
              <div
                key={`pad-${iso}`}
                aria-hidden
                className="aspect-square rounded-lg bg-surface-overlay/30 opacity-30"
              >
                <span className="p-1 font-mono text-caption1 tabular-nums text-text-muted">
                  {date.getDate()}
                </span>
              </div>
            );
          }
          const dayEvents = eventsByDate.get(iso) ?? [];
          const dayActivities = completedActivities?.get(iso) ?? [];
          const completed = dayActivities.length > 0 || (dayEvents.length > 0 && dayEvents.every((e) => e.done));
          const actualKm = dayActivities.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 1000;
          const plannedKm = dayEvents.reduce((sum, e) => sum + (e.predicted_distance_m ?? 0), 0) / 1000;
          const isToday = iso === today;
          const isSelected = iso === selectedDate;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              data-testid={`${dayTestIdPrefix}-${iso}`}
              data-today={isToday ? "true" : undefined}
              aria-label={[
                `${date.getDate()}日`,
                completed ? "已完成" : dayEvents.length > 0 ? "已计划" : "休息",
                actualKm > 0 ? `实际 ${actualKm.toFixed(1)} 公里` : "",
                plannedKm > 0 ? `计划 ${plannedKm.toFixed(1)} 公里` : "",
              ]
                .filter(Boolean)
                .join("，")}
              className={`flex min-h-16 flex-col justify-between rounded-lg p-1 text-left transition-colors ${
                isSelected
                  ? "bg-accent/20 accent-glow-soft"
                  : isToday
                    ? "bg-surface-active"
                    : dayEvents.length > 0
                      ? "bg-surface-overlay hover:bg-surface-active"
                      : "bg-surface-overlay/50 hover:bg-surface-active"
              }`}
            >
              <span className="flex items-start justify-between gap-1">
                <span
                  className={`font-mono text-caption1 tabular-nums ${
                    isToday ? "font-bold text-accent" : "text-text-secondary"
                  }`}
                >
                  {date.getDate()}
                </span>
                {isToday ? (
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-accent motion-safe:animate-ping"
                  />
                ) : null}
              </span>

              <span className="mt-1 flex justify-center">
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${dotFor(dayEvents, dayActivities, completed)}`}
                />
              </span>

              <span
                className={`mt-0.5 block font-mono text-caption1 tabular-nums ${
                  completed ? "text-accent" : "text-text-muted"
                }`}
              >
                {actualKm > 0
                  ? `${actualKm.toFixed(1)}k`
                  : plannedKm > 0
                    ? `${plannedKm.toFixed(1)}k`
                    : dayEvents.length === 0
                      ? "休"
                      : NO_VALUE}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * 这一格的颜色点。
 *
 * 有实际活动时按活动的运动类型取色；只有计划时按课表的训练类型取色；
 * 两样都没有就是休息。
 */
function dotFor(
  events: readonly CalendarEventDTO[],
  activities: readonly ActivitySummary[],
  completed: boolean,
): string {
  if (activities.length > 0) {
    const sport = getSportConfig(activities[0]?.sport ?? "Run").family;
    if (sport === "running") return TYPE_DOT.long ?? "bg-accent";
    if (sport === "strength") return TYPE_DOT.strength ?? "bg-tertiary-fixed";
    return TYPE_DOT.recovery ?? "bg-tertiary-dim";
  }
  if (events.length > 0) {
    const type = events[0]?.training_type ?? "easy";
    const dot = TYPE_DOT[type] ?? TYPE_DOT.easy ?? "bg-accent";
    return completed ? dot : `${dot} opacity-60`;
  }
  return TYPE_DOT.rest ?? "bg-surface-active";
}

function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
