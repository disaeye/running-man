"use client";

import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { ScoreRing } from "@shared/ui/ScoreRing";
import { Button } from "@shared/ui/button";
import { RefreshSpinner } from "./RefreshSpinner";
import type { Goal } from "@shared/types/goals";
import { goalReading } from "@features/goals/lib/goal-value";

interface GoalProgressProps {
  goal: Goal;
  onRefresh: () => void;
  refreshLoading: boolean;
  refreshError: string | null;
}

/** 体重目标的进度：从基线向目标的趋近比例。 */
function decreasePct(goal: Goal): number | null {
  const baseline = goal.baseline_value;
  const target = goal.target_value;
  if (baseline == null || target == null || baseline === target) return null;
  const done = baseline - goal.current_value;
  const total = baseline - target;
  if (total === 0) return null;
  return Math.min(100, Math.max(0, (done / total) * 100));
}

/** 累计类目标的进度：当前值占目标值的比例。 */
function increasePct(goal: Goal): number | null {
  const target = goal.target_value;
  if (target == null || target <= 0) return null;
  return Math.min(100, (goal.current_value / target) * 100);
}

/** 目标进度卡：环形进度按方向计算，附当前值与目标值的对照。 */
export function GoalProgress({ goal, onRefresh, refreshLoading, refreshError }: GoalProgressProps) {
  if (goal.status === "achieved") {
    return (
      <Card padding="md">
        <CardHeader title="目标进度" />
        <p className="mt-3 text-subheadline text-text-primary">已达成，累计与对照停在你标记时的读数。</p>
      </Card>
    );
  }

  const pct = goal.direction === "decrease" ? decreasePct(goal) : increasePct(goal);
  const current = goalReading(goal, goal.current_value);
  const target = goalReading(goal, goal.target_value);

  return (
    <Card padding="md">
      <CardHeader
        title="目标进度"
        trailing={
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshLoading}>
            {refreshLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <RefreshSpinner />
                刷新中…
              </span>
            ) : (
              "刷新进度"
            )}
          </Button>
        }
      />

      <div className="mt-3 flex items-center gap-4">
        {pct != null ? (
          <ScoreRing
            value={pct}
            max={100}
            size={72}
            strokeWidth={5}
            color="var(--color-accent)"
            ariaLabel={`目标进度 ${Math.round(pct)}%`}
          >
            <span className="font-mono tabular-nums text-callout font-bold text-text-primary">
              {Math.round(pct)}%
            </span>
          </ScoreRing>
        ) : null}
        <div className="flex-1">
          <p className="text-subheadline font-medium text-text-primary">
            {pct == null ? "尚未填写目标数值" : goal.direction === "decrease" ? "正在向目标体重趋近" : "按起算日累计中"}
          </p>
          {current && target ? (
            <p className="mt-0.5 font-mono tabular-nums text-caption1 text-text-secondary">
              {current.value}
              {current.unit ? ` ${current.unit}` : ""} / {target.value}
              {target.unit ? ` ${target.unit}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      {refreshError ? (
        <p role="alert" className="mt-3 text-caption1 text-error">{refreshError}</p>
      ) : null}
    </Card>
  );
}
