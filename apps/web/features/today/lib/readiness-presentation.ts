/**
 * Turns the API's readiness payload and training recommendation into something
 * the Today page can display honestly.
 *
 * Extracted from `HomePortrait` so the rules are testable without rendering.
 *
 * The problem this solves: the API always returns a readiness score. With no
 * wellness data every factor reads "数据不足" and the score is 50, which is
 * numerically identical to an athlete who genuinely scored 50. Presenting the
 * former as a measurement told people their recovery had been assessed when
 * nothing had been. These helpers separate "assessed" from "not assessed" and
 * say what is missing, instead of filling the gap with a default.
 */

export interface ReadinessFactor {
  name: string;
  detail: string;
}

export interface ReadinessPayload {
  score: number;
  level: string;
  factors?: readonly ReadinessFactor[];
  /**
   * Whether anything was actually measured.
   *
   * Optional so an older API response (or a test fixture) still works; when it
   * is absent the factor details are inspected instead. New code should rely on
   * the field: matching on detail text breaks when the wording changes.
   */
  data_sufficient?: boolean;
  observed_on?: string | null;
}

export interface RecommendationPayload {
  reason: string | null;
  next_workout: { name: string | null } | null;
  duration_min?: number | null;
  target_tss?: number | null;
  intensity?: string | null;
}

export interface Assessment {
  /** False when the API reported no usable inputs; `score` is then meaningless. */
  available: boolean;
  score: number;
  levelLabel: string;
  windowLabel: string;
  /** Human-readable names of the missing inputs, for the empty state. */
  missing: readonly string[];
}

const MISSING_MARKER = "数据不足";

const FACTOR_LABEL: Record<string, string> = {
  sleep: "睡眠",
  resting_hr: "静息心率",
  hrv: "HRV",
  tsb: "负荷平衡",
  atl_velocity: "疲劳变化",
};

const LEVEL_LABEL: Record<string, string> = {
  high: "状态良好",
  moderate: "状态稳定",
  recovery: "需要恢复",
  rest: "建议休息",
};

export const INTENSITY_LABEL: Record<string, string> = {
  high: "高强度",
  moderate: "中等强度",
  low: "低强度",
  none: "休息",
};

const NOT_ASSESSED: Assessment = {
  available: false,
  score: 0,
  levelLabel: "",
  windowLabel: "AWAITING DATA",
  missing: [],
};

export function assessReadiness(readiness: ReadinessPayload | null): Assessment {
  if (!readiness) return NOT_ASSESSED;

  const factors = readiness.factors ?? [];
  const measured = factors.filter((factor) => !factor.detail.includes(MISSING_MARKER));
  const missing = factors
    .filter((factor) => factor.detail.includes(MISSING_MARKER))
    .map((factor) => FACTOR_LABEL[factor.name] ?? factor.name);

  // Prefer the server's explicit answer. Falling back to inspecting the factors
  // keeps this working against a response that predates the field, but that
  // path is text-matching and is not the contract.
  const available =
    readiness.data_sufficient ?? (measured.length > 0);

  return {
    available,
    score: readiness.score,
    levelLabel: LEVEL_LABEL[readiness.level] ?? readiness.level,
    windowLabel: available
      ? readiness.level === "high"
        ? "GREEN WINDOW"
        : "ADAPTIVE WINDOW"
      : "AWAITING DATA",
    missing,
  };
}

/** A failed or stale activity feed is not the same as "all clear". */
export function isStaleData(bucket: string | null | undefined): boolean {
  return bucket === "stale" || bucket === "missing";
}

export function decisionTitle(
  decision: RecommendationPayload | null,
  assessment: Assessment,
): string {
  if (decision?.next_workout?.name) return decision.next_workout.name;
  if (!assessment.available) return "还没有可分析的训练数据";
  return "今天暂无具体课表";
}

export function decisionReason(
  decision: RecommendationPayload | null,
  assessment: Assessment,
): string {
  if (decision?.reason) return decision.reason;
  if (!assessment.available) {
    const what =
      assessment.missing.length > 0 ? assessment.missing.join("、") : "恢复数据";
    return `缺少${what}，无法给出训练建议。连接数据源或填写阈值后，这里会显示当天该做什么。`;
  }
  return "当前没有为今天安排训练。";
}
