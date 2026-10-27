"use client";

import { type ComponentType, useEffect, useState } from "react";
import { Activity, Flower2, Leaf, Mountain, Sprout, Wrench } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { MetricStrip } from "@shared/ui/MetricStrip";
import { Badge } from "@shared/ui/Badge";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getReadinessApiV1InsightsReadinessGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { apiErrorMessage } from "@shared/lib/api";
import type { Goal } from "@shared/types/goals";
import { estimateCurrentPhase, daysRemaining } from "./goal-utils";

/**
 * `/insights/readiness` 的回应类型直接取生成的契约，不手写：分数、等级和
 * 建议文字在 `local_readiness` 里，`data_sufficient` 标出这份读数是否算真实
 * 评估。这份回应只在 `shouldLoadProjection` 成立（active 目标且有 90 天内的
 * `target_date`）时取，此时 `date` 取 `target_date`。
 */
type ReadinessResponse = Generated.ReadinessResponseOutput;

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
 * 比赛准备度：比赛窗口（90 天内、进行中）才渲染。
 *
 * 两格读数（倒计时、预计完赛）+ 一句就绪建议 + 一行减量建议。
 * 就绪状态的徽章去卡头右侧，因为它是「这张卡当前处于什么状态」；身体里不再
 * 摆第三格 TSB——接口不提供数值型 TSB，拿展示句反推就是拿字符串猜数，
 * 而一个没有数据源的格子不该占版面。
 */
export function RaceReadinessCard({ goal }: RaceReadinessCardProps) {
  const days = daysRemaining(goal.target_date);
  const [projection, setProjection] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shouldLoadProjection = Boolean(
    goal.target_date && days !== null && days <= RACE_WINDOW_DAYS && goal.status === "active",
  );

  useEffect(() => {
    if (!shouldLoadProjection || !goal.target_date) return;
    const targetDate = goal.target_date;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    callOrvalValidated(
      (fetchFn) => getReadinessApiV1InsightsReadinessGet({ date: targetDate }, {}, fetchFn),
      Generated.ReadinessResponse,
    )
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
  const predictedFinish = formatPredictedFinish(goal);
  const taperAdvice = getTaperAdvice(currentPhase, days);
  const readiness = projection?.local_readiness ?? null;
  // 样本不够时不把分数、徽章当结论：接口的 `data_sufficient` 就是回答这个问题的字段。
  const measured = readiness !== null && readiness.data_sufficient;

  return (
    <Card padding="md">
      <CardHeader
        title="比赛准备度"
        trailing={
          measured ? (
            <Badge variant={readinessVariant(readiness.level)}>
              {readinessLabel(readiness.level)}
            </Badge>
          ) : null
        }
      />

      <MetricStrip
        columns={2}
        items={[
          { label: "距比赛", value: String(days), unit: "天" },
          { label: "预计完赛", value: predictedFinish, unit: goal.unit ?? undefined },
        ]}
      />

      {error && !loading ? (
        <p className="mt-3 text-caption1 text-error">{error}</p>
      ) : loading ? (
        <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-surface-active" aria-hidden="true" />
      ) : readiness !== null ? (
        <p className="mt-3 text-caption1 leading-relaxed text-text-secondary">
          {readiness.recommendation || "按当前状态调整训练强度。"}
        </p>
      ) : null}

      <p className="mt-2 flex items-start gap-1.5 text-caption1 text-text-muted">
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          <PhaseIcon phase={currentPhase} />
        </span>
        <span>减量期建议 · {taperAdvice}</span>
      </p>
    </Card>
  );
}

/** 当前阶段图标；阶段名不在这五档里时退回通用活动图标。 */
function PhaseIcon({ phase }: { readonly phase: string }) {
  const Icon = PHASE_ICONS[phase] ?? Activity;
  return <Icon className="size-3.5" />;
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
