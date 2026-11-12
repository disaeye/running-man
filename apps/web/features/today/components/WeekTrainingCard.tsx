"use client";

import Link from "next/link";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { cn } from "@shared/lib/utils";
import type {
  CalendarEventDTO,
  SessionSegmentDTO,
} from "@features/calendar/components/types";
import {
  buildWeekTrainingRows,
  type WeekTrainingInput,
} from "@features/today/lib/week-training-rows";
import { WorkoutSegments } from "./WorkoutSegments";

type Prescription = NonNullable<CalendarEventDTO["workout_prescription"]>;

interface Props extends WeekTrainingInput {
  /** 周序号，写在卡片右上角。例如「第 44 周」。 */
  readonly weekLabel: string;
  /** 当天处方；如果有分段结构，展开在今天的条目下方。 */
  readonly prescription: Prescription | null;
}

/**
 * 本周训练面板：参考稿右侧第二块面板。
 *
 * 按行罗列本周从周一到周日的安排或实际完成，今天所在的那一行加高亮点并
 * 标出今天所在的行。卡片底部提供前往日历的入口。
 */
export function WeekTrainingCard({
  events,
  activityMap,
  weekStart,
  timezone,
  todayKey,
  weekLabel,
  prescription,
}: Props) {
  const rows = buildWeekTrainingRows({
    events,
    activityMap,
    weekStart,
    timezone,
    todayKey,
  });

  const segments: readonly SessionSegmentDTO[] = prescription?.segments ?? [];

  return (
    <Card data-testid="home-weekly-horizon" className="flex flex-col">
      <CardHeader
        title="本周训练"
        trailing={<span className="tabular-nums text-caption1 text-text-muted">{weekLabel}</span>}
      />

      <div className="flex-1 min-h-0">
        {rows.length === 0 ? (
          <p className="py-12 text-center text-subheadline text-text-muted">本周暂无训练安排</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <div key={row.dayKey} className="py-2.5">
                <div className="flex items-baseline justify-between text-subheadline">
                  <div className="flex items-center gap-2 min-w-0">
                    {row.isToday ? (
                      <span className="size-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
                    ) : null}
                    <span
                      className={cn(
                        "truncate",
                        row.isToday ? "font-medium text-text-primary" : "text-text-secondary",
                      )}
                    >
                      {row.dayLabel} · {row.title}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-caption1 tabular-nums shrink-0 ml-4",
                      row.isToday ? "font-medium text-accent-strong" : "text-text-muted",
                    )}
                  >
                    {row.metric}
                  </span>
                </div>

                {row.isToday && segments.length > 0 ? (
                  <div className="mt-2.5 border-l-2 border-primary/40 pl-3">
                    <WorkoutSegments segments={segments} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto pt-4">
        <Link
          href="/calendar"
          className="focus-ring inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-5 text-subheadline font-medium text-on-primary transition-colors hover:bg-primary-active"
        >
          查看日历
        </Link>
      </div>
    </Card>
  );
}
