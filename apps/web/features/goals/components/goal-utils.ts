import type { Goal, GoalStatus_ } from "@shared/types/goals";
import { toISODate } from "@shared/lib/format";

const DAY_MS = 86_400_000;

/** Compute goal progress percentage (0–100) */
export function goalProgress(goal: Goal): number {
  const target = goal.target_value;
  if (!target || target <= 0) return 0;
  return Math.min(100, (goal.current_value / target) * 100);
}

/** Days remaining until target date, or null if no date */
export function daysRemaining(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const target = new Date(targetDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((target - now) / DAY_MS));
}

/**
 * Determine whether a goal is on-track, behind, or at-risk.
 * Compares progress ratio against time elapsed ratio.
 */
export function computeGoalStatus(goal: Goal): GoalStatus_ {
  if (!goal.target_date || !goal.target_value || goal.target_value <= 0) {
    return "on-track";
  }
  const totalMs = new Date(goal.target_date).getTime() - new Date(goal.created_at).getTime();
  if (totalMs <= 0) return goal.current_value >= goal.target_value ? "on-track" : "at-risk";

  const elapsedMs = Date.now() - new Date(goal.created_at).getTime();
  const timeRatio = Math.min(1, elapsedMs / totalMs);
  const progressRatio = goal.current_value / goal.target_value;

  if (progressRatio >= timeRatio * 0.95) return "on-track";
  if (progressRatio >= timeRatio * 0.65) return "behind";
  return "at-risk";
}

const STATUS_LABELS: Record<GoalStatus_, string> = {
  "on-track": "正常",
  "behind": "落后",
  "at-risk": "告急",
};

export function statusLabel(status: GoalStatus_): string {
  return STATUS_LABELS[status];
}

export function statusVariant(
  status: GoalStatus_,
): "success" | "warning" | "error" {
  if (status === "on-track") return "success";
  if (status === "behind") return "warning";
  return "error";
}

/** Today as YYYY-MM-DD */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Training phase names in chronological order */
export const PHASE_ORDER = ["base", "build", "peak", "taper", "recovery"] as const;

export const PHASE_LABELS: Record<string, string> = {
  base: "基础期",
  build: "强化期",
  peak: "巅峰期",
  taper: "减量期",
  recovery: "恢复期",
};

/**
 * Estimate the current training phase from a goal's timeline.
 * Splits the total duration into 5 phases with fixed proportions.
 */
export function estimateCurrentPhase(goal: Goal): string {
  if (!goal.target_date) return "base";
  const start = new Date(goal.created_at).getTime();
  const end = new Date(goal.target_date).getTime();
  if (start >= end) return "recovery";

  const now = Date.now();
  const totalDuration = end - start;
  const elapsed = Math.max(0, now - start);
  const pct = Math.min(1, elapsed / totalDuration);

  // Phase boundaries: 40% base, 25% build, 15% peak, 10% taper, 10% recovery
  if (pct < 0.40) return "base";
  if (pct < 0.65) return "build";
  if (pct < 0.80) return "peak";
  if (pct < 0.90) return "taper";
  return "recovery";
}

/** Simple recommendations based on progress rate (max 3) */
export function getGoalRecommendations(goal: Goal): string[] {
  const tips: string[] = [];
  const status = computeGoalStatus(goal);
  const days = daysRemaining(goal.target_date);

  if (status === "on-track") {
    tips.push("按当前进度，预计可在目标日前达成。保持节奏！");
    if (days !== null && days <= 14) {
      tips.push("距目标日不到两周，进入减量期，避免过度训练。");
    }
    if (goal.type === "consistency") {
      tips.push("坚持每日记录，连续性是达成目标的关键。");
    }
  } else if (status === "behind") {
    tips.push("进度略落后，建议适当增加训练频次或强度。");
    if (days !== null && days <= 30) {
      tips.push("剩余时间不足一个月，考虑聚焦核心训练。");
    }
    tips.push("检查当前训练计划，确保高质量训练日得到充分利用。");
  } else {
    tips.push("进度严重落后，需重新评估目标或调整策略。");
    if (days !== null && days <= 7) {
      tips.push("目标日仅剩一周，建议设定新的阶段目标。");
    }
    tips.push("回顾近期训练量，排查影响进度的外部因素。");
  }

  return tips.slice(0, 3);
}
