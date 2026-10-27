"use client";

import Link from "next/link";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { formatPaceFromSeconds } from "@shared/lib/format";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";
import { intensityLabel, workoutTypeLabel } from "@features/today/lib/session-label";
import { WorkoutSegments } from "./WorkoutSegments";

/**
 * 今日课表卡：全页唯一一张行动卡（`variant="action"`，带 `--shadow-panel`）。
 *
 * 一屏只允许一张行动卡，两张等于没有行动。这张卡的职责是让人读完就知道
 * 现在该做什么，所以标题是 28px 的一句话，下面才是配速、分段和两个数字。
 *
 * 分段来自当天的日历事件而不是 recommendation：recommendation 只给出一节课的
 * 总量，分段结构只有 `workout_prescription` 有。没有处方就整块不出现，
 * 卡片其余部分照常——缺一段结构不代表今天没有安排。
 */

type Prescription = NonNullable<CalendarEventDTO["workout_prescription"]>;

const UNRECORDED = "未记录";

interface Props {
  readonly decision: CoachRecommendation | null;
  /** 当天日历事件的 `workout_prescription`。 */
  readonly prescription: Prescription | null;
  /** 今天的日期标签，锚住这张卡说的是哪一天。 */
  readonly todayLabel: string;
}

/** 高亮第一个质量段；全是热身放松时不高亮任何一段。 */
function qualityIndex(segments: ReadonlyArray<{ type: string }>): number {
  return segments.findIndex((segment) => segment.type !== "warmup" && segment.type !== "cooldown");
}

function paceLine(decision: CoachRecommendation | null): string | null {
  const pace = decision?.pace_targets ?? null;
  if (!pace) return null;
  return `配速 ${formatPaceFromSeconds(pace.min_s_per_km)}–${formatPaceFromSeconds(pace.max_s_per_km)}/km`;
}

export function TodayWorkoutCard({ decision, prescription, todayLabel }: Props) {
  const segments = prescription?.segments ?? [];
  const isRest = decision?.action === "rest";
  const durationMin = decision?.duration_min ?? prescription?.duration_min ?? null;
  const workoutType = decision?.workout_type ?? prescription?.type ?? null;

  const title = isRest
    ? "今天休息"
    : durationMin != null && workoutType
      ? `${Math.round(durationMin)} 分钟${workoutTypeLabel(workoutType)}`
      : "今天没有安排课表";

  const intensity = decision?.intensity ?? null;
  const trailing = [intensity ? intensityLabel(intensity) : null, workoutType ? workoutTypeLabel(workoutType) : null]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const pace = paceLine(decision);
  const targetTss = decision?.target_tss ?? null;

  return (
    <Card variant="action">
      <CardHeader
        title="今日焦点"
        trailing={
          trailing ? (
            <span className="tabular-nums text-caption1 text-text-muted">{trailing}</span>
          ) : undefined
        }
      />

      <p className="tabular-nums text-caption1 text-text-muted">{todayLabel}</p>
      <h2 className="mt-1 text-display-sm font-semibold leading-snug text-text-primary">{title}</h2>
      {pace ? <p className="mt-1 tabular-nums text-caption1 text-text-secondary">{pace}</p> : null}

      {segments.length > 0 ? (
        <WorkoutSegments segments={segments} highlightIndex={qualityIndex(segments)} />
      ) : null}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-border-subtle pt-4">
        <div className="flex gap-8">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-title2 font-semibold tabular-nums text-text-primary">
                {durationMin != null ? Math.round(durationMin) : UNRECORDED}
              </span>
              {durationMin != null ? (
                <span className="text-caption1 text-text-muted">分钟</span>
              ) : null}
            </div>
            <p className="text-caption1 text-text-muted">时长</p>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-title2 font-semibold tabular-nums text-text-primary">
                {targetTss != null ? Math.round(targetTss) : UNRECORDED}
              </span>
              {targetTss != null ? <span className="text-caption1 text-text-muted">TSS</span> : null}
            </div>
            <p className="text-caption1 text-text-muted">负荷</p>
          </div>
        </div>

        <Link
          href="/calendar"
          className="focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-subheadline font-medium text-on-primary transition-colors hover:bg-primary-active sm:w-auto"
        >
          查看课表
        </Link>
      </div>
    </Card>
  );
}
