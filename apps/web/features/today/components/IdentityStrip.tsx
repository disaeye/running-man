"use client";

import type { GradeSnapshot } from "@features/today/lib/grade-label";
import { SampleBadge } from "@shared/dev/SampleBadge";

/**
 * 首页身份条：一行，不加容器，上下各一条 1px 发丝边，直接落在画布上。
 *
 * 它回答「我是谁」，两种形态二选一：
 *
 * - 有等级时：等级徽章加 40px 完赛时间，右边跟项目与年龄组，最右是年龄分级
 *   与今天就绪分数。等级是从最近一场比赛算出来的事实，比累计里程更能说明水平。
 * - 没有等级时：40px 是全期累计里程——不是本周、不是近 30 天；其余是 12px 标签
 *   （训练次数、连续周数、数据截止日），最下面一行说明为什么没有等级
 *   （「还没有比赛成绩」「门槛表未填」「出生日期、性别没填」）。
 *
 * 缺值写「未记录」，不写 0：没同步到数据的那一天和练了 0 次的那一天，
 * 眼睛要用不同方式读。状态点的颜色是数据语义色，只用在点上，分数本身用正文墨色。
 */

/** 缺值文案。全页只在这里定义一次，和 DESIGN.md 的第 9 节一致。 */
const UNRECORDED = "未记录";

const LEVEL_DOT: Record<string, string> = {
  high: "bg-success",
  moderate: "bg-accent",
  recovery: "bg-warning",
  rest: "bg-warning",
};

interface Props {
  /** 全期累计里程，米。 */
  readonly distanceM: number | null;
  /** 全期活动条数。 */
  readonly sessionCount: number | null;
  /** 连续有训练的周数。 */
  readonly streakWeeks: number | null;
  readonly readinessScore: number | null;
  readonly readinessLevel: string | null;
  /** 活动数据的截止日，ISO 字符串。 */
  readonly asOf: string | null;
  /** 等级快照；没有等级时为 null，此时走累积量形态。 */
  readonly grade: GradeSnapshot | null;
  /** 这条等级是示例数据（没有真实成绩时顶上）；为真时条上挂「示例数据」。 */
  readonly sampleGrade?: boolean;
  /** 没有等级的原因，接口原话。 */
  readonly gradeReason: string | null;
}

function distanceLabel(distanceM: number | null): string {
  if (distanceM == null) return UNRECORDED;
  return (distanceM / 1000).toFixed(1);
}

function countLabel(value: number | null): string {
  return value == null ? UNRECORDED : String(value);
}

export function IdentityStrip({
  distanceM,
  sessionCount,
  streakWeeks,
  readinessScore,
  readinessLevel,
  asOf,
  grade,
  sampleGrade = false,
  gradeReason,
}: Props) {
  const dayKey = asOf ? asOf.slice(0, 10) : null;
  const asOfLabel = dayKey ? dayKey.slice(5) : UNRECORDED;
  const dot = readinessLevel ? LEVEL_DOT[readinessLevel] : undefined;

  return (
    <div className="border-y border-border-subtle py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {grade ? (
          <div className="flex min-w-0 items-center gap-2" title={grade.detail}>
            <span className="rounded-full bg-accent px-2.5 py-1 text-caption1 font-medium text-accent-foreground">
              {grade.badge}
            </span>
            <span className="font-mono text-metric-lg font-semibold tabular-nums text-text-primary">
              {grade.time}
            </span>
            {sampleGrade ? <SampleBadge /> : null}
          </div>
        ) : (
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="font-mono text-metric-lg font-semibold tabular-nums text-text-primary">
              {distanceLabel(distanceM)}
            </span>
            <span className="text-caption1 text-text-muted">km</span>
          </div>
        )}

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-caption1 text-text-muted">
          {grade ? <span>{grade.context}</span> : null}
          {grade ? null : <span className="tabular-nums">训练 {countLabel(sessionCount)} 次</span>}
          {grade ? null : <span className="tabular-nums">连续 {countLabel(streakWeeks)} 周</span>}
          <span className="tabular-nums">数据截至 {asOfLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          {grade?.pct ? (
            <span className="text-caption1 tabular-nums text-text-muted">{grade.pct}</span>
          ) : null}
          <span className="text-caption1 text-text-muted">准备度</span>
          <span className="font-mono text-caption1 font-medium tabular-nums text-text-secondary">
            {countLabel(readinessScore)}
          </span>
          {dot ? <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} /> : null}
        </div>
      </div>

      {grade == null && gradeReason ? (
        <p className="mt-2 text-caption1 text-text-muted">{gradeReason}</p>
      ) : null}
    </div>
  );
}
