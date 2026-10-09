/**
 * Recovery helpers — shared pure functions for the recovery health page.
 * Constants follow ACSM guidelines + clinical RHR variability literature:
 * - SLEEP_TARGET_SECS: 7h baseline for healthy adult sleep (National Sleep Foundation)
 * - RHR_ANOMALY_BPM: 2 SD ≈ 5bpm for trained athletes above 7-day baseline
 */

/** Minimum healthy sleep duration (7 hours, in seconds). */
export const SLEEP_TARGET_SECS = 7 * 3600;

/** RHR deviation (bpm) above 7-day baseline that flags a fatigue/anomaly signal. */
export const RHR_ANOMALY_BPM = 5;

/** Days considered for "recent baseline" computations. */
export const BASELINE_WINDOW_DAYS = 7;

/** Maximum number of recovery tips surfaced to the user (UX cap, not data cap). */
export const MAX_RECOVERY_TIPS = 5;

export type RecoveryLevel = "good" | "moderate" | "poor";

export interface RecoveryBand {
  level: RecoveryLevel;
  /** Tailwind text color token, e.g. "text-recovery-good" */
  colorClass: string;
  /** CSS color var for chart strokes / ScoreRing */
  stroke: string;
  /** Chinese label shown to the user. */
  label: string;
}

/**
 * Backend readiness level (from /api/insights/readiness) — authoritative.
 * Thresholds defined in apps/api/src/domain/load/constants.py:
 * READINESS_HIGH_INTENSITY_MIN=80, READINESS_MODERATE_MIN=60, READINESS_RECOVERY_MIN=40.
 */
export type ReadinessLevel = "high" | "moderate" | "recovery" | "rest";

const BAND_GOOD: RecoveryBand = {
  level: "good",
  colorClass: "text-recovery-good",
  stroke: "var(--color-recovery-good)",
  label: "良好",
};

const BAND_MODERATE: RecoveryBand = {
  level: "moderate",
  colorClass: "text-recovery-moderate",
  stroke: "var(--color-recovery-moderate)",
  label: "一般",
};

const BAND_POOR: RecoveryBand = {
  level: "poor",
  colorClass: "text-recovery-poor",
  stroke: "var(--color-recovery-poor)",
  label: "需恢复",
};

/**
 * Map the backend's authoritative readiness level to a display band.
 * Preferred over bandForScore when the level field is available.
 */
export function bandForLevel(level: ReadinessLevel): RecoveryBand {
  if (level === "high") return BAND_GOOD;
  if (level === "moderate") return BAND_MODERATE;
  return BAND_POOR;
}

/**
 * Map a 0-100 readiness score to a semantic band.
 * Thresholds mirror READINESS_HIGH_INTENSITY_MIN (80), READINESS_MODERATE_MIN (60),
 * READINESS_RECOVERY_MIN (40) from apps/api/src/domain/load/constants.py.
 * Use bandForLevel instead when the backend level field is available.
 */
export function bandForScore(score: number): RecoveryBand {
  if (score >= 80) return BAND_GOOD;
  if (score >= 60) return BAND_MODERATE;
  return BAND_POOR;
}

/** Average of an array, ignoring null/undefined; returns null if no data. */
export function avg(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => v != null && !Number.isNaN(v));
  if (clean.length === 0) return null;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

/**
 * Cumulative sleep debt (seconds) — sum of nightly deficit vs SLEEP_TARGET_SECS
 * across the given window. Positive = deficit, negative = surplus.
 */
export function cumulativeSleepDebt(
  nightlySeconds: Array<number | null | undefined>,
  target = SLEEP_TARGET_SECS,
): number {
  return nightlySeconds.reduce<number>((debt, secs) => {
    if (secs == null || Number.isNaN(secs)) return debt;
    return debt + Math.max(0, target - secs);
  }, 0);
}

/**
 * Recovery tips from wellness + readiness, ordered by severity.
 * Returns at most MAX_RECOVERY_TIPS strings.
 */
export interface TipInput {
  score: number;
  lastSleepSecs: number | null;
  lastRhr: number | null;
  rhrDeviation: number | null;
  sleepDebt7d: number;
}

type TipRule = (input: TipInput) => string | null;

const TIP_RULES: TipRule[] = [
  (i) =>
    i.lastSleepSecs != null && i.lastSleepSecs < 5 * 3600
      ? "昨晚睡眠不足5小时，建议今日以低强度恢复为主"
      : null,
  (i) =>
    i.lastSleepSecs != null && i.lastSleepSecs >= 5 * 3600 && i.lastSleepSecs < 6 * 3600
      ? "睡眠偏少，注意补充水分并避免高强度训练"
      : null,
  (i) =>
    i.rhrDeviation != null && i.rhrDeviation > RHR_ANOMALY_BPM
      ? `静息心率较基线偏高${Math.round(i.rhrDeviation)}bpm，提示疲劳累积`
      : null,
  (i) =>
    i.sleepDebt7d > 4 * 3600
      ? "近7日累计睡眠负债超过4小时，建议安排补眠日"
      : null,
  (i) =>
    i.sleepDebt7d > 2 * 3600 && i.sleepDebt7d <= 4 * 3600
      ? "近期存在轻度睡眠负债，关注睡眠规律"
      : null,
  (i) =>
    i.lastRhr == null || i.lastSleepSecs == null
      ? "健康数据不完整，建议同步设备获取更精准的恢复分析"
      : null,
  (i) => (i.score < 45 ? "恢复评分偏低，建议今日休息或仅做拉伸/散步" : null),
  (i) => (i.score >= 70 ? "状态良好，可安排目标训练课" : null),
];

export function buildRecoveryTips(input: TipInput): string[] {
  return TIP_RULES
    .map((rule) => rule(input))
    .filter((tip): tip is string => tip != null)
    .slice(0, MAX_RECOVERY_TIPS);
}

/**
 * Derive tip inputs from a wellness window (typically last 7 days) plus
 * an optional readiness score. Newest non-null values are used as "last".
 */
export function deriveTipInput(
  wellness: Array<{ day: string; sleep_secs: number | null; resting_hr: number | null }>,
  score: number | null,
): TipInput {
  const sorted = [...wellness].sort((a, b) => a.day.localeCompare(b.day));
  const lastSleep = [...sorted].reverse().find((w) => w.sleep_secs != null)?.sleep_secs ?? null;
  const lastRhr = [...sorted].reverse().find((w) => w.resting_hr != null)?.resting_hr ?? null;
  const baselineRhr = avg(sorted.slice(0, -1).map((w) => w.resting_hr));
  const rhrDeviation = lastRhr != null && baselineRhr != null ? lastRhr - baselineRhr : null;
  const sleepDebt = cumulativeSleepDebt(sorted.map((w) => w.sleep_secs));
  return {
    score: score ?? 50,
    lastSleepSecs: lastSleep,
    lastRhr,
    rhrDeviation,
    sleepDebt7d: sleepDebt,
  };
}
