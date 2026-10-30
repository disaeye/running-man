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

import {
  READINESS_BANDS_BY_LEVEL,
  type ReadinessLevel,
} from "@shared/config/generated/readiness-bands";

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
  /** `rest` when the readiness band rules out training today. */
  action?: string | null;
  duration_min?: number | null;
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
  /**
   * The same inputs by their contract key (`tsb`, `hrv`, `sleep` …).
   *
   * Callers that need to suppress a derived number ask this rather than
   * `missing`, which holds display labels and changes when the copy does.
   */
  missingKeys: readonly string[];
}

const MISSING_MARKER = "数据不足";

const FACTOR_LABEL: Record<string, string> = {
  sleep: "睡眠",
  resting_hr: "静息心率",
  hrv: "HRV",
};

/**
 * The band label for a readiness level, taken from
 * `contracts/v1/readiness-bands.yaml` through the generated registry. The
 * Today page and the Settings page therefore name a level identically.
 */
export function readinessLevelLabel(level: string): string {
  const band = READINESS_BANDS_BY_LEVEL[level as ReadinessLevel];
  return band?.label ?? level;
}

/**
 * 因子键 → 中文名。
 *
 * 接口给的是 `resting_hr`、`atl_velocity` 这类合同键，直接印在卡上读不成句子。
 * 表原本只服务于 `assessReadiness` 的缺项文案，现在因子网格也要同一套名字，
 * 所以开一个出口，而不是在组件里抄第二份。查不到的键原样返回。
 */
export function readinessFactorLabel(name: string): string {
  return FACTOR_LABEL[name] ?? name;
}

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
  missingKeys: [],
};

export function assessReadiness(readiness: ReadinessPayload | null): Assessment {
  if (!readiness) return NOT_ASSESSED;

  const factors = readiness.factors ?? [];
  const measured = factors.filter((factor) => !factor.detail.includes(MISSING_MARKER));
  const missingFactors = factors.filter((factor) => factor.detail.includes(MISSING_MARKER));
  const missing = missingFactors.map(
    (factor) => FACTOR_LABEL[factor.name] ?? factor.name,
  );

  // Prefer the server's explicit answer. Falling back to inspecting the factors
  // keeps this working against a response that predates the field, but that
  // path is text-matching and is not the contract.
  const available =
    readiness.data_sufficient ?? (measured.length > 0);

  return {
    available,
    score: readiness.score,
    levelLabel: readinessLevelLabel(readiness.level),
    windowLabel: available
      ? readiness.level === "high"
        ? "GREEN WINDOW"
        : "ADAPTIVE WINDOW"
      : "AWAITING DATA",
    missing,
    missingKeys: missingFactors.map((factor) => factor.name),
  };
}

/** A failed or stale activity feed is not the same as "all clear". */
export function isStaleData(bucket: string | null | undefined): boolean {
  return bucket === "stale" || bucket === "missing";
}

export function decisionTitle(
  decision: RecommendationPayload | null,
  assessment: Assessment,
  options: { readonly hasLoadHistory?: boolean } = {},
): string {
  if (!assessment.available) {
    // Load history and recovery signals are different inputs. With training
    // data on the page, "还没有可分析的训练数据" reads as a contradiction next to
    // a filled load chart; name the input that is actually missing instead.
    if (options.hasLoadHistory) {
      const missing = assessment.missing.length > 0 ? assessment.missing.join("、") : "恢复信号";
      return `已有跑步记录，缺少${missing}，当前无法查看恢复状态`;
    }
    return "还没有可分析的训练数据";
  }
  const state = assessment.levelLabel;
  if (decision?.next_workout?.name) return `${state} · 按计划${decision.next_workout.name}`;
  if (decision?.action === "rest") return `${state} · 建议休息`;
  return `${state} · 暂无具体课表`;
}