"use client";

import Link from "next/link";
import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { intensityLabel, workoutTypeLabel } from "@features/today/lib/session-label";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";
import { DemoWorkoutSteps, type DemoStep } from "./DemoWorkoutSteps";

type Prescription = NonNullable<CalendarEventDTO["workout_prescription"]>;

const UNRECORDED = NO_VALUE;

interface Props {
  readonly decision: CoachRecommendation | null;
  /** 当天日历事件的处方。 */
  readonly prescription: Prescription | null;
  readonly todayLabel: string;
  /** 已经关联上的活动（课表已完成）。 */
  readonly linkedActivityId: string | null;
  readonly testId?: string;
}

/**
 * 今日焦点训练卡（参考稿第二张卡）。
 *
 * 这是全页唯一一张行动卡：它说清楚今天练什么、怎么练、练多久。
 *
 * 主按钮按当天状态换三种含义：
 *   · 还没完成：打开执行面板（导出课表 / 关联已同步的活动 / 手动打卡）
 *   · 已经完成：直接去看今天的战报
 *   · 今天是休息日：展示恢复建议与明日预告
 */
export function DemoTodayWorkoutCard({
  decision,
  prescription,
  todayLabel,
  linkedActivityId,
  testId,
}: Props) {
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

  const isRest = decision?.action === "rest";
  const durationMin = decision?.duration_min ?? prescription?.duration_min ?? null;
  const workoutType = decision?.workout_type ?? prescription?.type ?? null;
  const targetTss = decision?.target_tss ?? null;

  const title = isRest
    ? "今天休息"
    : workoutType
      ? workoutTypeLabel(workoutType)
      : "今天没有安排课表";

  const pace = decision?.pace_targets ?? null;
  const paceText = pace
    ? `${formatPaceFromSeconds(pace.min_s_per_km)}–${formatPaceFromSeconds(pace.max_s_per_km)}`
    : null;

  // 主课段：第一个既不是热身也不是放松的段。
  const highlightIndex = segments.findIndex(
    (segment) => segment.type !== "warmup" && segment.type !== "cooldown",
  );

  const intensity = decision?.intensity ?? null;
  const zoneChip =
    intensity && pace
      ? `${zoneLabel(intensity)} · 目标 ${paceText}/km`
      : intensity
        ? `${zoneLabel(intensity)}`
        : null;

  return (
    <Card variant="action" data-testid={testId} className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-accent/15 blur-3xl"
      />

      <div className="relative flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-accent motion-safe:animate-pulse"
          />
          <LabelCaps className="text-accent">TODAY&apos;S WORKOUT · 今日焦点</LabelCaps>
        </span>
        {zoneChip ? (
          <span className="font-mono text-caption1 text-text-secondary">{zoneChip}</span>
        ) : null}
      </div>

      <h2 className="relative mt-2 text-display-sm font-semibold text-text-primary">
        {title}
      </h2>
      <p className="relative mt-1 text-caption1 text-text-muted">{todayLabel}</p>

      {segments.length > 0 ? (
        <div className="relative mt-4 rounded-lg bg-surface-overlay px-2 py-2">
          <DemoWorkoutSteps segments={segments} highlightIndex={highlightIndex} />
        </div>
      ) : null}

      <div className="relative mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-border-subtle pt-4">
        <div className="flex gap-6">
          <div>
            <p className="text-caption1 text-text-muted">预估耗时</p>
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="font-mono text-title2 font-bold tabular-nums text-accent">
                {durationMin != null ? Math.round(durationMin) : UNRECORDED}
              </span>
              {durationMin != null ? (
                <span className="text-caption1 text-text-muted">MIN</span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="text-caption1 text-text-muted">训练冲量 (TSS)</p>
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="font-mono text-title2 font-bold tabular-nums text-accent">
                {targetTss != null ? Math.round(targetTss) : UNRECORDED}
              </span>
              {targetTss != null ? (
                <span className="text-caption1 text-text-muted">PTS</span>
              ) : null}
            </p>
          </div>
        </div>

        <PrimaryAction
          isRest={isRest}
          linkedActivityId={linkedActivityId}
          hasPlan={segments.length > 0 || workoutType != null}
        />
      </div>
    </Card>
  );
}

/**
 * 主操作按钮。
 *
 * 课表已完成时去看战报；还没完成时打开执行面板；休息日没有可执行的动作，
 * 按钮变成前往日历。
 */
function PrimaryAction({
  isRest,
  linkedActivityId,
  hasPlan,
}: {
  readonly isRest: boolean;
  readonly linkedActivityId: string | null;
  readonly hasPlan: boolean;
}) {
  if (linkedActivityId) {
    return (
      <Link
        href={`/activities/${linkedActivityId}`}
        className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 font-display text-subheadline font-bold uppercase tracking-wider text-on-primary accent-glow transition-transform active:scale-95 sm:w-auto"
      >
        查看今日战报
      </Link>
    );
  }
  if (isRest) {
    return (
      <Link
        href="/calendar"
        className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-overlay px-6 font-display text-subheadline font-bold uppercase tracking-wider text-accent transition-transform active:scale-95 sm:w-auto"
      >
        查看明日安排
      </Link>
    );
  }
  return (
    <Link
      href="/calendar"
      className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 font-display text-subheadline font-bold uppercase tracking-wider text-on-primary accent-glow transition-transform active:scale-95 sm:w-auto"
    >
      {hasPlan ? "执行课表" : "查看课表"}
    </Link>
  );
}

/** 强度区间标签。 */
function zoneLabel(intensity: string): string {
  const label = intensityLabel(intensity);
  return label ? `ZONE ${label}` : "ZONE";
}
