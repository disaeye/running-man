"use client";

import { type ComponentType, useEffect, useState } from "react";
import { Activity, Check, Flower2, Leaf, Mountain, Sprout, Wrench } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { Goal } from "@shared/types/goals";
import { PHASE_ORDER, PHASE_LABELS, estimateCurrentPhase, daysRemaining } from "./goal-utils";

/** Readiness projection from /api/insights/readiness */
interface RaceProjection {
  score: number;
  level: string;
  recommendation: string;
}

interface RaceReadinessCardProps {
  goal: Goal;
}

const RACE_WINDOW_DAYS = 90;

const PHASE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  base: Sprout,
  build: Wrench,
  peak: Mountain,
  taper: Leaf,
  recovery: Flower2,
};

/**
 * Race Readiness Card — shown when a goal has a target_date within 90 days.
 * Displays: countdown badge, predicted finish, taper advice, phase timeline.
 * Fetches TSB/readiness projection for the race date from the insights API.
 */
export function RaceReadinessCard({ goal }: RaceReadinessCardProps) {
  const days = daysRemaining(goal.target_date);
  const [projection, setProjection] = useState<RaceProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shouldLoadProjection = Boolean(
    goal.target_date && days !== null && days <= RACE_WINDOW_DAYS && goal.status === "active",
  );

  useEffect(() => {
    if (!shouldLoadProjection || !goal.target_date) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    apiFetch<RaceProjection>("/insights/readiness", {
      params: { date: goal.target_date },
    })
      .then((data) => {
        if (!cancelled) setProjection(data);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(apiErrorMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [goal.target_date, shouldLoadProjection]);

  // Only render for active goals with race dates within 90 days
  if (!shouldLoadProjection || days === null) {
    return null;
  }

  const currentPhase = estimateCurrentPhase(goal);
  const currentIndex = PHASE_ORDER.indexOf(currentPhase as typeof PHASE_ORDER[number]);
  const predictedFinish = formatPredictedFinish(goal);
  const taperAdvice = getTaperAdvice(currentPhase, days);

  return (
    <Card className="relative overflow-hidden">
      {/* Ambient gradient accent — washi paper warmth */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ctl via-atl-magenta to-tsb-gold" />

      {/* Header: title + countdown badge */}
      <div className="flex items-center justify-between">
        <h3 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          比赛准备度
        </h3>
        <div className="flex items-center gap-1.5 rounded-full bg-surface-overlay px-3 py-1">
          <span className="text-caption1 text-text-muted">距比赛</span>
          <span className="font-mono tabular-nums text-callout font-bold text-ctl">{days}</span>
          <span className="text-caption1 text-text-muted">天</span>
        </div>
      </div>

      {/* Predicted finish time — large monospace */}
      <div className="mt-4 flex flex-col items-center gap-1 rounded-lg bg-surface-overlay py-5">
        <span className="text-caption1 font-medium text-text-muted">预计完赛时间</span>
        {loading ? (
          <div className="h-8 w-32 animate-pulse rounded bg-surface-active" />
        ) : (
          <span className="font-mono tabular-nums text-largeTitle font-bold tracking-tight text-text-primary">
            {predictedFinish}
          </span>
        )}
        {goal.unit && (
          <span className="text-caption1 text-text-secondary">{goal.unit}</span>
        )}
      </div>

      {/* Readiness projection */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-caption1 font-medium text-text-secondary">TSB 预测</span>
          {projection && (
            <Badge variant={readinessVariant(projection.level)}>
              {readinessLabel(projection.level)}
            </Badge>
          )}
        </div>
        {projection && (
          <div className="mt-2 rounded-md bg-insight-bg px-3 py-2 text-caption1 leading-relaxed text-text-secondary">
            {projection.recommendation || "按当前状态调整训练强度。"}
          </div>
        )}
        {error && !loading && (
          <p className="mt-2 text-caption1 text-error">{error}</p>
        )}
      </div>

      {/* Taper recommendation */}
      <div className="mt-4 flex items-start gap-2 rounded-md border border-border-subtle bg-surface-raised px-3 py-2.5">
        <span className="text-headline leading-none">{(() => { const Icon = PHASE_ICONS[currentPhase] ?? Activity; return <Icon className="h-4 w-4" />; })()}</span>        <div>
          <p className="text-caption1 font-medium text-text-primary">减量期建议</p>
          <p className="mt-0.5 text-caption1 leading-relaxed text-text-secondary">
            {taperAdvice}
          </p>
        </div>
      </div>

      {/* Phase timeline — race preparation */}
      <div className="mt-5">
        <div className="relative flex items-center gap-0">
          {PHASE_ORDER.map((phase, i) => {
            const isCurrent = phase === currentPhase;
            const isPast = i < currentIndex;
            const isLast = i === PHASE_ORDER.length - 1;

            return (
              <div key={phase} className="flex flex-1 flex-col items-center">
                <div className="relative flex w-full items-center">
                  {i > 0 && (
                    <div className={`h-0.5 flex-1 ${isPast ? "bg-ctl" : "bg-border-subtle"}`} />
                  )}
                  <div
                    className={`
                      relative z-10 flex h-7 w-7 shrink-0 items-center justify-center
                      rounded-full text-caption2 font-bold transition-all duration-300
                      ${isCurrent
                        ? "bg-accent text-accent-foreground shadow-[0_0_10px_var(--color-ctl)]"
                        : isPast
                          ? "bg-ctl/30 text-ctl"
                          : "bg-surface-overlay text-text-muted border border-border-subtle"
                      }
                    `.trim()}
                  >
                    {isPast ? <Check className="h-4 w-4 text-success" /> : (() => { const Icon = PHASE_ICONS[phase]; return Icon ? <Icon className="h-3 w-3" /> : <span>•</span>; })()}
                  </div>
                  {isLast
                    ? <div className="h-0.5 flex-1" />
                    : <div className="h-0.5 flex-1 bg-border-subtle" />
                  }
                </div>
                <span
                  className={`mt-1.5 text-center text-caption2 leading-tight ${
                    isCurrent
                      ? "font-semibold text-ctl"
                      : isPast
                        ? "text-text-secondary"
                        : "text-text-muted"
                  }`}
                >
                  {PHASE_LABELS[phase] ?? phase}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/** Estimate finish time from current progress and target value */
function formatPredictedFinish(goal: Goal): string {
  if (!goal.target_value || goal.target_value <= 0) return "--";
  const progress = goal.current_value / goal.target_value;
  if (progress >= 1) return "可达成";
  if (progress < 0.1) return "数据不足";

  // Linear extrapolation: current rate → projected finish
  const remainRatio = 1 - progress;
  const pctStr = (progress * 100).toFixed(0);
  return `${pctStr}% · 预计${remainRatio <= 0.15 ? "即将" : "可控"}`;
}

/** Taper advice based on current phase and remaining days */
function getTaperAdvice(phase: string, days: number): string {
  if (phase === "taper") return "已进入减量期，逐步降低训练量，保持强度但缩短时长。";
  if (phase === "peak") return "巅峰期冲刺阶段，注意恢复，避免受伤。";
  if (phase === "build") return "强化训练期，确保高质量课表完成度。";
  if (phase === "base") return "基础期积累中，重视有氧基础和力量训练。";
  if (days <= 7) return "比赛前夕，放松心态，轻活动为主。";
  return "维持训练节奏，关注身体恢复信号。";
}

/** Map API readiness level to Badge variant */
function readinessVariant(level: string): "success" | "warning" | "error" | "info" | "neutral" {
  if (level === "high") return "success";
  if (level === "moderate") return "warning";
  if (level === "recovery") return "error";
  return "neutral";
}

/** Map API readiness level to Chinese label */
function readinessLabel(level: string): string {
  const labels: Record<string, string> = {
    high: "状态极佳",
    moderate: "状态适中",
    recovery: "需要恢复",
    rest: "建议休息",
  };
  return labels[level] ?? level;
}
