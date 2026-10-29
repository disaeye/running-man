"use client";

import { Card } from "@shared/ui/Card";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";
import type { ActivePlan } from "@features/goals/hooks/useActivePlan";

/**
 * 当前激活计划卡（参考稿的激活计划卡）。
 *
 * 四块信息：状态与阶段、计划名称与目标、三格指标、周期进度条。
 *
 * 三格指标是阶段周次、周目标跑量、目标比赛配速。每格的数都来自计划
 * 本身：阶段周次是这周在阶段里的第几周，周目标跑量是这一周课表里
 * 计划距离的合计，目标比赛配速是目标比赛按 Daniels 配速表折算出来的。
 *
 * 周期进度条把三个阶段排在一条线上，当前阶段的位置用实心块标出。
 */

interface Props {
  readonly plan: ActivePlan;
  readonly testId?: string;
}

export function DemoActivePlanCard({ plan, testId }: Props) {
  const phase = plan.current_phase;
  const weekDistanceKm =
    plan.week_planned_distance_m != null ? plan.week_planned_distance_m / 1000 : null;
  const racePace = raceTargetPace(plan);

  return (
    <Card
      data-testid={testId ?? "demo-active-plan-card"}
      className="relative overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/10 blur-3xl"
      />

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-accent px-2 py-0.5 text-caption1 font-bold text-on-primary">
            ACTIVE IN-PROGRESS
          </span>
          {phase ? (
            <span className="font-mono text-caption1 text-text-muted">
              周期: {phase.label}
            </span>
          ) : null}
        </div>
        {plan.plan_progress_pct != null ? (
          <span className="font-mono text-caption1 text-accent">
            进度 {Math.round(plan.plan_progress_pct)}%
          </span>
        ) : null}
      </div>

      <div className="relative mt-3">
        <h2 className="font-display text-title2 uppercase leading-tight tracking-wide text-text-primary">
          {plan.goal_title ?? "还没有训练计划"}
        </h2>
        <p className="mt-0.5 text-caption1 text-text-muted">
          {plan.target_date
            ? `目标日期 ${plan.target_date}`
            : "生成计划后这里显示目标日期"}
        </p>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-3">
        <Metric
          label="阶段周次"
          value={
            plan.phase_week_number != null && plan.phase_total_weeks != null
              ? `${String(plan.phase_week_number).padStart(2, "0")}`
              : NO_VALUE
          }
          unit={
            plan.phase_total_weeks != null ? `/ ${plan.phase_total_weeks} 周` : null
          }
        />
        <Metric
          label="周目标跑量"
          value={weekDistanceKm != null ? weekDistanceKm.toFixed(0) : NO_VALUE}
          unit={weekDistanceKm != null ? "km" : null}
        />
        <Metric
          label="目标比赛配速"
          value={racePace != null ? formatPaceFromSeconds(Math.round(racePace)) : NO_VALUE}
          unit={racePace != null ? "/km" : null}
        />
      </div>

      <div className="relative mt-4 space-y-1.5">
        <div className="flex justify-between items-center font-mono text-caption1">
          {plan.phases.map((item) => (
            <span
              key={item.name}
              className={item.is_current ? "text-accent" : "text-text-muted"}
            >
              {item.label}
            </span>
          ))}
        </div>
        <PhaseBar phases={plan.phases} />
      </div>
    </Card>
  );
}

/**
 * 一格指标。
 */
function Metric({
  label,
  value,
  unit,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg bg-surface-overlay px-3 py-2.5">
      <p className="text-caption1 text-text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-title2 font-bold tabular-nums text-text-primary">
          {value}
        </span>
        {unit ? (
          <span className="font-mono text-caption1 text-text-muted">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * 阶段进度条。
 *
 * 每个阶段按它在计划里的天数占宽度，当前阶段亮起。没有阶段就没有条。
 */
function PhaseBar({
  phases,
}: {
  readonly phases: readonly {
    name: string;
    label: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
  }[];
}) {
  if (phases.length === 0) {
    return <div className="h-2 w-full rounded-full bg-surface-active" aria-hidden />;
  }
  const totalDays = phases.reduce((sum, phase) => {
    const start = Date.parse(phase.start_date);
    const end = Date.parse(phase.end_date);
    if (Number.isNaN(start) || Number.isNaN(end)) return sum;
    return sum + Math.max(1, Math.round((end - start) / 86_400_000) + 1);
  }, 0);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-active">
      {phases.map((phase) => {
        const start = Date.parse(phase.start_date);
        const end = Date.parse(phase.end_date);
        const days =
          Number.isNaN(start) || Number.isNaN(end)
            ? 1
            : Math.max(1, Math.round((end - start) / 86_400_000) + 1);
        const width = totalDays > 0 ? (days / totalDays) * 100 : 0;
        return (
          <span
            key={phase.name}
            className={phase.is_current ? "bg-accent" : "bg-surface-active"}
            style={{ width: `${width}%` }}
            title={phase.label}
          />
        );
      })}
    </div>
  );
}

/**
 * 目标比赛的配速。
 *
 * 由目标距离与目标用时算出，是这个目标下的平均配速——不是训练配速。
 */
function raceTargetPace(plan: ActivePlan): number | null {
  const distance = plan.race_distance_m;
  const timeS = plan.race_target_time_s;
  if (distance == null || timeS == null || distance <= 0 || timeS <= 0) {
    return null;
  }
  return timeS / (distance / 1000);
}
