import { formatPaceFromSeconds } from "@shared/lib/format";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { NO_VALUE } from "@shared/lib/use-data-state";

import type { AutoCalcResult } from "../components/settings-training-params-model";

/**
 * What one physiology estimate says, and whether it can be used.
 *
 * The three estimates share a shape but not a vocabulary: heart rate is a
 * bpm number derived from session peaks, threshold pace is a time per
 * kilometre derived from race efforts. Building the rows here keeps the
 * component free of per-metric branching and keeps the reasons next to the
 * numbers they explain.
 */

export type EstimateKey = "hr_max" | "lthr" | "threshold_pace";

/**
 * Which way the estimate moved the number, in the athlete's favour or against.
 *
 * No confidence badge: "置信度 中" does not tell anyone whether to press 采用,
 * so it just moves the decision back to the reader with less information. The
 * direction of the change is a fact about the two numbers; what to do with it
 * is the athlete's call.
 */
export type EstimateTrend = "progress" | "regress" | "flat";

export interface EstimateRow {
  readonly key: EstimateKey;
  readonly label: string;
  /** Current form value, formatted the way the field shows it. */
  readonly current: string;
  /** Estimated value, formatted; null when the algorithm refused. */
  readonly estimate: string | null;
  /** Raw value to write into the form; null when there is nothing to apply. */
  readonly value: number | null;
  /** The evidence behind the number: how many sessions, over what window. */
  readonly basis: string;
  /** Direction of the change, or null when there is nothing to compare. */
  readonly trend: EstimateTrend | null;
  /** Present when the algorithm refused: what it needs and what it has. */
  readonly shortfall: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  tangent: "切线法",
  rolling_max: "滚动最高值",
  best_effort_window: "最佳努力窗口",
  critical_speed_model: "临界速度模型",
  daniels_vdot_threshold: "跑力换算",
};

export const TREND_LABEL: Record<EstimateTrend, string> = {
  progress: "进步",
  regress: "退步",
  flat: "持平",
};

/** Arrow keyed to performance, not to the number: a faster pace is 进步. */
export const TREND_GLYPH: Record<EstimateTrend, string> = {
  progress: "↑",
  regress: "↓",
  flat: "=",
};

/**
 * Compare an estimate with the value in force.
 *
 * A one-unit difference reads as 持平. Both numbers are rounded to whole bpm or
 * whole seconds per kilometre, so a single unit is the rounding, not a change —
 * reporting it as 进步 would claim the athlete got faster on the strength of a
 * rounding step.
 */
function trendFor(
  key: EstimateKey,
  current: number | null,
  estimate: number | null,
): EstimateTrend | null {
  if (current == null || estimate == null) return null;
  const delta = estimate - current;
  if (Math.abs(delta) <= 1) return "flat";
  // A faster pace is a smaller number of seconds per kilometre.
  const better = key === "threshold_pace" ? delta < 0 : delta > 0;
  return better ? "progress" : "regress";
}

function methodNote(method: string | null): string {
  if (!method) return "";
  const label = METHOD_LABEL[method];
  return label ? ` · ${label}` : "";
}

function bpm(value: number | null): string {
  return value == null ? NO_VALUE : `${value} ${HEART_RATE_UNIT}`;
}

/**
 * When the estimate last wrote the thresholds, as MM-DD HH:mm.
 *
 * Imported activities now recompute the estimate, so this is the answer to
 * "are these numbers current?" — a date alone would leave the athlete guessing
 * whether a morning sync had already been folded in.
 */
export function formatComputedAt(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function buildEstimateRows(
  result: AutoCalcResult,
  current: { hr_max: number | null; lthr: number | null; threshold_pace: number | null },
): EstimateRow[] {
  const hr = result.hr_max;
  const lthr = result.lthr;
  const pace = result.threshold_pace;

  return [
    {
      key: "hr_max" as const,
      label: "最大心率",
      current: bpm(current.hr_max),
      estimate: hr.data_sufficient ? bpm(hr.hr_max) : null,
      value: hr.data_sufficient ? hr.hr_max : null,
      basis: `${hr.session_count} 次活动 · 近 ${hr.input_window_days} 天${methodNote(hr.method)}`,
      trend: trendFor("hr_max", current.hr_max, hr.data_sufficient ? hr.hr_max : null),
      shortfall: hr.data_sufficient
        ? null
        : `需要至少 ${hr.required_sessions} 次含最高心率记录的训练，近 ${hr.input_window_days} 天有 ${hr.session_count} 次`,
    },
    {
      key: "lthr" as const,
      label: "乳酸阈心率",
      current: bpm(current.lthr),
      estimate: lthr.data_sufficient ? bpm(lthr.lthr) : null,
      value: lthr.data_sufficient ? lthr.lthr : null,
      basis: `${lthr.near_threshold_count} 次高强度 · 近 ${lthr.input_window_days} 天${methodNote(lthr.method)}`,
      trend: trendFor("lthr", current.lthr, lthr.data_sufficient ? lthr.lthr : null),
      shortfall: lthr.data_sufficient
        ? null
        : `需要至少 ${lthr.required_efforts} 次持续 20 分钟以上且含心率的高强度跑，目前 ${lthr.near_threshold_count} 次`,
    },
    {
      key: "threshold_pace" as const,
      label: "阈值配速",
      current:
        current.threshold_pace == null
          ? NO_VALUE
          : `${formatPaceFromSeconds(current.threshold_pace)} /km`,
      estimate:
        pace.data_sufficient && pace.threshold_pace_s_per_km != null
          ? `${formatPaceFromSeconds(pace.threshold_pace_s_per_km)} /km`
          : null,
      value: pace.data_sufficient ? pace.threshold_pace_s_per_km : null,
      basis: `${pace.effort_count} 次跑步 · 近 ${pace.input_window_days} 天${methodNote(pace.method)}`,
      trend: trendFor(
        "threshold_pace",
        current.threshold_pace,
        pace.data_sufficient ? pace.threshold_pace_s_per_km : null,
      ),
      shortfall: pace.data_sufficient
        ? null
        : `需要至少 ${pace.required_efforts} 次全力或节奏跑（单次 > 1 km 且 > 3 分钟、配速在个人最佳 15% 内且平均心率 ≥ 阈值心率 91%，无心率带仅看配速），近 ${pace.input_window_days} 天仅识别到 ${pace.effort_count} 次`,
    },
  ];
}

export interface SyncedReadingInput {
  readonly day: string;
  readonly value: number;
}

export interface SyncReadingsControl {
  readonly loading: boolean;
  readonly error: string | null;
  readonly restingHr: SyncedReadingInput | null;
  readonly weight: SyncedReadingInput | null;
  readonly currentRestingHr: number | null;
  readonly currentWeightKg: number | null;
  readonly onPull: () => void;
  readonly onApply: (patch: { resting_hr?: number; weight_kg?: number }) => void;
}

/** Build comparison rows for synced wellness readings (`resting_hr`, `weight_kg`). */
export function buildSyncedRows(syncReadings: SyncReadingsControl) {
  const rhrNext = syncReadings.restingHr ? Math.round(syncReadings.restingHr.value) : null;
  const weightNext = syncReadings.weight ? Number(syncReadings.weight.value.toFixed(2)) : null;
  return [
    {
      key: "resting_hr" as const,
      label: "静息心率",
      currentText: syncReadings.currentRestingHr == null ? NO_VALUE : `${syncReadings.currentRestingHr} ${HEART_RATE_UNIT}`,
      nextText: rhrNext == null ? null : `${rhrNext} ${HEART_RATE_UNIT}`,
      nextValue: rhrNext,
      day: syncReadings.restingHr?.day ?? "",
      differs: rhrNext != null && rhrNext !== syncReadings.currentRestingHr,
    },
    {
      key: "weight_kg" as const,
      label: "体重",
      currentText: syncReadings.currentWeightKg == null ? NO_VALUE : `${syncReadings.currentWeightKg} kg`,
      nextText: weightNext == null ? null : `${weightNext} kg`,
      nextValue: weightNext,
      day: syncReadings.weight?.day ?? "",
      differs: weightNext != null && weightNext !== syncReadings.currentWeightKg,
    },
  ];
}
