"use client";

import { formatPaceFromSeconds } from "@shared/lib/format";
import { Badge } from "@shared/ui/Badge";
import { segmentLabel } from "@features/today/lib/session-label";

/**
 * 编号步骤卡：一节课从热身到放松，按序号一步一行。
 *
 * 序号只表示顺序，不表示「第几组」——组数是同一个步骤内部的重复次数，
 * 写在步骤名后面的标签里（×6），两者不会混为一谈。
 *
 * 行与行之间只用一条发丝线，不给每行铺底色：这段要读的是「一共几步、
 * 每步多久多快」，六块底色会把三行读成六块面板。当前也没有「进行到第几步」
 * 的数据，所以不做高亮。
 *
 * 没有的字段就不出现：热身段没有配速，那一行就只有时长与 RPE。
 */

export interface WorkoutStepView {
  readonly type: string;
  readonly duration_min: number;
  readonly pace_min_s_km?: number | null;
  readonly pace_max_s_km?: number | null;
  readonly repetitions?: number | null;
  readonly recovery_min?: number | null;
  readonly rpe_min?: number | null;
  readonly rpe_max?: number | null;
}

interface Props {
  readonly segments: ReadonlyArray<WorkoutStepView>;
}

/** 配速区间；只有一侧时按单值写，两侧都没有返回 null。 */
function paceText(segment: WorkoutStepView): string | null {
  const min = segment.pace_min_s_km ?? null;
  const max = segment.pace_max_s_km ?? null;
  if (min != null && max != null) {
    return `${formatPaceFromSeconds(min)}–${formatPaceFromSeconds(max)}/km`;
  }
  if (min != null || max != null) return `${formatPaceFromSeconds(min ?? max)}/km`;
  return null;
}

/** RPE 区间：热身的强度只有这一项，缺了这一步就只剩时长。 */
function rpeText(segment: WorkoutStepView): string | null {
  const min = segment.rpe_min ?? null;
  const max = segment.rpe_max ?? null;
  if (min != null && max != null) return `RPE ${min}–${max}`;
  if (min != null || max != null) return `RPE ${min ?? max}`;
  return null;
}

/** 右侧那串小字：时长、配速、RPE，按数据有没有依次拼。 */
function stepDetail(segment: WorkoutStepView): string {
  const parts = [`${Math.round(segment.duration_min)} 分钟`];
  const pace = paceText(segment);
  if (pace) parts.push(pace);
  const rpe = rpeText(segment);
  if (rpe) parts.push(rpe);
  return parts.join(" · ");
}

export function WorkoutStepList({ segments }: Props) {
  if (segments.length === 0) return null;

  return (
    <ol className="mt-3 divide-y divide-border-subtle" data-testid="workout-step-list">
      {segments.map((segment, index) => {
        const repetitions = segment.repetitions ?? 1;
        // 组间恢复只在真的有多组时才说；一组跑完没有「组间」。
        const recovery = repetitions > 1 ? (segment.recovery_min ?? null) : null;
        return (
          <li
            key={`${segment.type}-${index}`}
            className="py-2.5 first:pt-0 last:pb-0"
            data-testid="workout-step"
          >
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-3">
              <span className="text-right font-mono text-caption1 tabular-nums text-text-muted">
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-body font-medium text-text-primary">
                  {segmentLabel(segment.type)}
                </span>
                {repetitions > 1 ? (
                  <Badge variant="neutral" className="font-mono tabular-nums">
                    ×{repetitions}
                  </Badge>
                ) : null}
              </span>
              <span className="text-right text-caption1 tabular-nums text-text-secondary">
                {stepDetail(segment)}
              </span>
            </div>
            {recovery != null ? (
              <p className="mt-1 pl-8 text-caption1 text-text-muted">组间恢复 {recovery} 分钟</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
