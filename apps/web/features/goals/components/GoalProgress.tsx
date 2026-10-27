"use client";

import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { ScoreRing } from "@shared/ui/ScoreRing";
import type { Goal } from "@shared/types/goals";
import {
  goalProgress,
  computeGoalStatus,
  getGoalRecommendations,
  statusLabel,
} from "./goal-utils";

interface GoalProgressProps {
  goal: Goal;
}

const STATUS_BAND_COLOR: Record<string, string> = {
  "on-track": "var(--color-goal-on-track)",
  behind: "var(--color-goal-behind)",
  "at-risk": "var(--color-goal-at-risk)",
};

/**
 * 目标进度卡：环形进度是这一卡唯一的主数字，右侧一句状态加一行当前值 / 目标值。
 *
 * 两个数字不拆成格：只有两个数的「对比」是关系和，不是摘要，拆成两格后视觉上
 * 就不再是一句话里的两个数；三格以上的读数才用 MetricStrip。
 *
 * 建议列表用发丝线分隔，不刷成三条圆角底色块——卡内再套三块小卡，读起来
 * 就是四层卡片。
 */
export function GoalProgress({ goal }: GoalProgressProps) {
  if (goal.status === "achieved") return null;

  const pct = goalProgress(goal);
  const status = computeGoalStatus(goal);
  const recommendations = getGoalRecommendations(goal);
  const ringColor = STATUS_BAND_COLOR[status] ?? "var(--color-accent)";

  return (
    <Card padding="md">
      <CardHeader title="目标进度" />

      <div className="flex items-center gap-4">
        <ScoreRing
          value={pct}
          max={100}
          size={72}
          strokeWidth={5}
          color={ringColor}
          ariaLabel={`目标进度 ${Math.round(pct)}% — ${statusLabel(status)}`}
        >
          <span className="font-mono tabular-nums text-callout font-bold text-text-primary">
            {Math.round(pct)}%
          </span>
        </ScoreRing>

        <div className="flex-1">
          <p className="text-subheadline font-medium text-text-primary">
            {statusLabel(status)}
          </p>
          {goal.target_value != null && goal.target_value > 0 && (
            <p className="mt-0.5 font-mono tabular-nums text-caption1 text-text-secondary">
              {goal.current_value.toFixed(1)} / {goal.target_value.toFixed(1)}
              {goal.unit ? ` ${goal.unit}` : ""}
            </p>
          )}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-border-subtle border-t border-border-subtle">
        {recommendations.map((tip, i) => (
          <li key={i} className="flex items-start gap-2 py-2.5">
            <TipIcon status={status} />
            <span className="text-subheadline leading-relaxed text-text-secondary">
              {tip}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TipIcon({ status }: { status: string }) {
  const color =
    status === "on-track"
      ? "text-goal-on-track"
      : status === "behind"
        ? "text-goal-behind"
        : "text-goal-at-risk";

  return (
    <svg
      className={`mt-0.5 h-4 w-4 shrink-0 ${color}`}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      {status === "on-track" ? (
        <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.5 5.3l-4.5 5.5L4.3 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : status === "behind" ? (
        <path d="M8 1l7 14H1L8 1zM8 6v4m0 2v.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 4v5m0 3v.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}
