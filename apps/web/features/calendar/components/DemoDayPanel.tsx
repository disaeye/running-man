"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { DemoWorkoutSteps, type DemoStep } from "@features/today/components/DemoWorkoutSteps";
import {
  completionPct,
  DemoActualColumn,
  DemoPlanColumn,
} from "@features/calendar/components/DemoDayMetrics";

/**
 * 选中日期详情面板（参考稿的当日训练详情）。
 *
 * 三种状态：
 *   · 已经练过并且有计划：左右两栏对照——计划课表与实际完成
 *   · 还没练：显示计划课表与「添加训练」入口
 *   · 休息日：显示恢复提示
 *
 * 计划那栏写的是课表上的目标（距离、配速区间），实际那栏写的是
 * 记录下来的（距离、用时、配速、心率、步频）。两栏说的都是同一件事，
 * 所以它们便于比较。
 */

interface Props {
  readonly date: string;
  readonly event: CalendarEventDTO | undefined;
  readonly activities: readonly ActivitySummary[];
  readonly onEdit?: () => void;
  readonly onAdd?: () => void;
  readonly testId?: string;
}

export function DemoDayPanel({
  date,
  event,
  activities,
  onEdit,
  onAdd,
  testId,
}: Props) {
  const prescription = event?.workout_prescription ?? null;
  const segments: DemoStep[] = (prescription?.segments ?? []).map((segment) => ({
    type: segment.type,
    duration_min: segment.duration_min,
    pace_min_s_km: segment.pace_min_s_km,
    pace_max_s_km: segment.pace_max_s_km,
    repetitions: segment.repetitions,
    recovery_min: segment.recovery_min,
    rpe_min: segment.rpe_min,
    rpe_max: segment.rpe_max,
  }));
  const hasPlan = event != null;
  const completed = activities.length > 0;

  return (
    <Card padding="md" data-testid={testId ?? "demo-day-panel"}>
      {hasPlan ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-caption1 font-bold ${
                    completed
                      ? "bg-accent text-on-primary"
                      : "bg-surface-overlay text-text-secondary"
                  }`}
                >
                  {completed ? "已完成" : "已计划"}
                </span>
                <span className="font-display text-title3 text-text-primary">
                  {event?.name?.trim() || "训练安排"}
                </span>
              </div>
              <p className="mt-1 font-mono text-caption1 text-text-muted">{date}</p>
            </div>
            {completed ? (
              <div className="shrink-0 text-right">
                <p className="font-mono text-title2 font-bold tabular-nums text-accent">
                  {completionPct(event, activities)}
                </p>
                <p className="text-caption1 text-text-muted">目标达成率</p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DemoPlanColumn event={event} />
            <DemoActualColumn activities={activities} />
          </div>

          {segments.length > 0 ? (
            <div className="mt-4 rounded-lg bg-surface-overlay px-2 py-2">
              <DemoWorkoutSteps segments={segments} />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="focus-ring inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-display text-subheadline font-bold uppercase tracking-wider text-on-primary transition-transform active:scale-95"
              >
                调整训练安排
              </button>
            ) : null}
            {onAdd ? (
              <button
                type="button"
                onClick={onAdd}
                className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface-overlay px-4 font-display text-subheadline font-bold uppercase tracking-wider text-text-primary transition-colors hover:bg-surface-active"
              >
                添加训练
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <LabelCaps>REST DAY · 休息日</LabelCaps>
          <p className="mt-2 text-body text-text-secondary">
            这一天没有训练安排。恢复是训练的一部分：睡够、把今天的活动补上，
            明天才跑得动。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {onAdd ? (
              <button
                type="button"
                onClick={onAdd}
                className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 font-display text-subheadline font-bold uppercase tracking-wider text-on-primary transition-transform active:scale-95"
              >
                在这一天添加训练
              </button>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}