"use client";

import { formatPaceFromSeconds } from "@shared/lib/format";
import { segmentLabel } from "@features/today/lib/session-label";
import { NO_VALUE } from "@shared/lib/use-data-state";

/**
 * 参考稿里的课表结构：热身、主课、放松三段，主课那一步整行高亮。
 *
 * 与 `WorkoutStepList` 的区别只有形状：这里是「小圆点 + 步骤名 + 右侧
 * 时长」，主课段有底色。序号不出现——参考稿的课表用圆点表示段落，不编号；
 * 组数写在步骤名后的 ×N。
 *
 * 距离型步骤（`5 × 1000m`）显示距离，时长型步骤显示分钟，两者在右侧同列
 * 对齐。没有的字段不出现。
 */

export interface DemoStep {
  readonly type: string;
  readonly duration_min?: number | null;
  readonly distance_m?: number | null;
  readonly pace_min_s_km?: number | null;
  readonly pace_max_s_km?: number | null;
  readonly repetitions?: number | null;
  readonly recovery_s?: number | null;
  readonly recovery_min?: number | null;
  readonly rpe_min?: number | null;
  readonly rpe_max?: number | null;
}

interface Props {
  readonly segments: ReadonlyArray<DemoStep>;
  /** 高亮哪一步（主课）。索引越界时不高亮任何一步。 */
  readonly highlightIndex?: number;
  readonly testId?: string;
}

/** 配速区间；只有一侧时按单值写，两侧都没有返回 null。 */
function paceText(segment: DemoStep): string | null {
  const min = segment.pace_min_s_km ?? null;
  const max = segment.pace_max_s_km ?? null;
  if (min != null && max != null) {
    return `${formatPaceFromSeconds(min)}–${formatPaceFromSeconds(max)}/km`;
  }
  if (min != null || max != null) return `${formatPaceFromSeconds(min ?? max)}/km`;
  return null;
}

/** RPE 区间：热身的强度只有这一项，缺了这一步就只剩时长。 */
function rpeText(segment: DemoStep): string | null {
  const min = segment.rpe_min ?? null;
  const max = segment.rpe_max ?? null;
  if (min != null && max != null) return `RPE ${min}–${max}`;
  if (min != null || max != null) return `RPE ${min ?? max}`;
  return null;
}

/** 步骤说明：配速、RPE、组间恢复，按数据有没有依次拼。 */
function stepDetail(segment: DemoStep): string | null {
  const parts: string[] = [];
  const pace = paceText(segment);
  if (pace) parts.push(pace);
  const rpe = rpeText(segment);
  if (rpe) parts.push(rpe);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 右侧那列数字：距离优先，其次时长。 */
function stepMeasure(segment: DemoStep): string | null {
  if (segment.distance_m != null && segment.distance_m > 0) {
    return formatDistance(segment.distance_m);
  }
  if (segment.duration_min != null && segment.duration_min > 0) {
    return `${Math.round(segment.duration_min)} 分钟`;
  }
  return null;
}

export function DemoWorkoutSteps({
  segments,
  highlightIndex,
  testId,
}: Props) {
  if (segments.length === 0) return null;

  return (
    <ol className="space-y-2" data-testid={testId ?? "demo-workout-steps"}>
      {segments.map((segment, index) => {
        const repetitions = segment.repetitions ?? 1;
        const recoverySeconds =
          repetitions > 1
            ? segment.recovery_s ?? (segment.recovery_min != null ? segment.recovery_min * 60 : null)
            : null;
        const highlighted = highlightIndex === index;
        const measure = stepMeasure(segment);
        const detail = stepDetail(segment);

        return (
          <li
            key={`${segment.type}-${index}`}
            className={
              highlighted
                ? "rounded-lg bg-accent/10 px-3 py-2"
                : "px-3 py-1"
            }
            data-testid="demo-workout-step"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span
                  aria-hidden="true"
                  className={
                    highlighted
                      ? "mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                      : "mt-1.5 size-1.5 shrink-0 rounded-full bg-text-muted"
                  }
                />
                <div className="min-w-0">
                  <p
                    className={
                      highlighted
                        ? "text-subheadline font-semibold text-accent"
                        : "text-subheadline text-text-primary"
                    }
                  >
                    {segmentLabel(segment.type)}
                    {repetitions > 1 ? (
                      <span className="ml-1.5 font-mono text-caption1 text-text-secondary">
                        ×{repetitions}
                      </span>
                    ) : null}
                  </p>
                  {detail ? (
                    <p className="mt-0.5 text-caption1 text-text-muted">{detail}</p>
                  ) : null}
                  {recoverySeconds != null ? (
                    <p className="mt-0.5 pl-3 text-caption1 text-text-muted">
                      组间恢复 {formatRecovery(recoverySeconds)}
                    </p>
                  ) : null}
                </div>
              </div>
              {measure ? (
                <p className="shrink-0 font-mono text-caption1 tabular-nums text-text-secondary">
                  {measure}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 一节课的步骤摘要：步骤列表加下方一行预估耗时。
 */
export function DemoWorkoutStepsCard({
  segments,
  highlightIndex,
  durationLabel,
  testId,
}: {
  readonly segments: ReadonlyArray<DemoStep>;
  readonly highlightIndex?: number;
  readonly durationLabel?: string | null;
  readonly testId?: string;
}) {
  if (segments.length === 0) return null;
  return (
    <div data-testid={testId}>
      <DemoWorkoutSteps segments={segments} highlightIndex={highlightIndex} />
      {durationLabel ? (
        <div className="mt-3 flex items-center gap-5 border-t border-border-subtle pt-3">
          {durationLabel ? (
            <div>
              <p className="text-caption1 text-text-muted">预估耗时</p>
              <p className="font-mono text-title2 tabular-nums text-accent">
                {durationLabel}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatDistance(metres: number): string {
  if (metres >= 1000) {
    const km = metres / 1000;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(2)} km`;
  }
  return `${Math.round(metres)} m`;
}

function formatRecovery(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} 分钟` : `${minutes} 分 ${rest} 秒`;
}

/** 缺值时的统一写法。 */
export const MISSING_MEASURE = NO_VALUE;
