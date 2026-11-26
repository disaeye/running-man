"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

/** 有基线的状态变化目标（如减重或增重）：从基线向目标的趋近比例。 */
function baselinePct(goal: Goal): number | null {
  const baseline = goal.baseline_value;
  const target = goal.target_value;
  if (baseline == null || target == null || baseline === target) return null;
  const done = goal.direction === "decrease" ? baseline - goal.current_value : goal.current_value - baseline;
  const total = goal.direction === "decrease" ? baseline - target : target - baseline;
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, (done / total) * 100));
}

/** 累计类目标的进度：当前值占目标值的比例。 */
function increasePct(goal: Goal): number | null {
  if (goal.type === "weight" && goal.baseline_value != null) {
    return baselinePct(goal);
  }
  const target = goal.target_value;
  if (target == null || target <= 0) return null;
  return Math.min(100, Math.max(0, (goal.current_value / target) * 100));
}

/** 系统减少动效偏好：同步订阅，变化时重渲染。 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** 数值增长：目标值到位时数字与环形同步从当前读数扫到目标值；系统减少动效时直接到位。 */
function useCountUp(target: number, active: boolean): number {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const animate = active && !reduced;

  useEffect(() => {
    if (!animate) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 600);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + (target - from) * eased;
      fromRef.current = value;
      setDisplay(value);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);

  if (!animate) return target;
  return display;
}

/** 目标进度卡：环形进度按方向计算，附当前值与目标值的对照。 */
export function GoalProgress({ goal, onRefresh, refreshLoading, refreshError }: GoalProgressProps) {
  const pct = goal.direction === "decrease" ? baselinePct(goal) : increasePct(goal);
  const shownPct = useCountUp(pct ?? 0, pct != null);

  const achieved = goal.status === "achieved";
  const ringPct = achieved ? 100 : pct;
  const current = goalReading(goal, goal.current_value);
  const target = goalReading(goal, goal.target_value);
  const baseline = goal.type === "weight" ? goalReading(goal, goal.baseline_value) : null;

  return (
    <Card padding="md">
      <CardHeader
        title="目标进度"
        trailing={
          !achieved ? (
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
          ) : undefined
        }
      />

      <div className="mt-3 flex items-center gap-4">
        {ringPct != null ? (
          <ScoreRing
            value={ringPct}
            max={100}
            size={72}
            strokeWidth={5}
            color={achieved ? "var(--color-success)" : "var(--color-accent)"}
            ariaLabel={`目标进度 ${Math.round(ringPct)}%`}
          >
            <span className="font-mono tabular-nums text-callout font-bold text-text-primary">
              {achieved ? "100" : Math.round(shownPct)}%
            </span>
          </ScoreRing>
        ) : null}
        <div className="flex-1">
          <p className="text-subheadline font-medium text-text-primary">
            {achieved
              ? "目标已达成"
              : pct == null
                ? "尚未填写目标数值"
                : goal.direction === "decrease"
                  ? "正在向目标体重趋近"
                  : "按起算日累计中"}
          </p>
          {current && target ? (
            <p className="mt-0.5 font-mono tabular-nums text-caption1 text-text-secondary">
              {baseline ? `起始 ${baseline.value}${baseline.unit ? ` ${baseline.unit}` : ""} · ` : ""}
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
