import type { ThresholdHistoryEntry } from "@features/settings/hooks/useThresholdHistory";
import type { CurrentReadings } from "@features/health/lib/physiology-display";
import { formatPaceFromSeconds } from "@shared/lib/format";

/**
 * 生理参数的来源分类。
 *
 * device=设备同步，manual=人工设置，estimate=系统估算。
 */
export type ParameterSource = "device" | "manual" | "estimate";

export interface PhysiologyParameter {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
  readonly source: ParameterSource | null;
  /** 已含动词的完整日期说明；读不到时显示「尚未记录」。 */
  readonly dateLabel: string | null;
}

const SOURCE_BY_THRESHOLD: Record<string, ParameterSource> = {
  manual: "manual",
  recorded: "manual",
  estimated: "estimate",
  age_estimate: "estimate",
  observed_max: "estimate",
  wellness: "device",
};

/** 阈值来源标签，来自 athlete_thresholds.source。 */
export function sourceFromThreshold(source: string | null | undefined): ParameterSource | null {
  if (!source) return null;
  return SOURCE_BY_THRESHOLD[source] ?? "estimate";
}

function latestThresholdValue(
  entries: readonly ThresholdHistoryEntry[],
  field: "hr_max" | "resting_hr" | "lthr" | "threshold_pace",
): { value: number; day: string; source: ParameterSource | null } | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry) continue;
    const value = entry[field];
    if (value == null) continue;
    return {
      value,
      day: entry.effective_from,
      source: sourceFromThreshold(entry.source),
    };
  }
  return null;
}

function effectiveDate(day: string | null | undefined): string | null {
  return day ? `生效 ${day}` : null;
}

function recordedDate(day: string | null | undefined): string | null {
  return day ? `记录于 ${day}` : null;
}

/**
 * 组装生理参数列表。
 *
 * 最大摄氧量是设备读数，设备只在符合条件的训练日写入，因此取全历史最近一条，
 * 不随任何页面时间窗口变化。其余四项是系统用于计算心率与配速区间的生效阈值，
 * 与 /athletes/me、/insights/zones 同源。
 */
export function buildPhysiologyParameters({
  entries,
  readings,
  lthrFallback = null,
  hrMaxFallback = null,
  thresholdPaceFallback = null,
  restingHrFallback = null,
}: {
  readonly entries: readonly ThresholdHistoryEntry[];
  /** 全历史最近一次设备读数。 */
  readonly readings: CurrentReadings;
  /** 当前生效的乳酸阈心率，用于阈值历史缺失时的兜底显示。 */
  readonly lthrFallback?: number | null;
  /** 当前生效的最大心率，用于阈值历史缺失时的兜底显示。 */
  readonly hrMaxFallback?: number | null;
  /** 当前生效的阈值配速（秒/公里），用于阈值历史缺失时的兜底显示。 */
  readonly thresholdPaceFallback?: number | null;
  /** 当前生效的静息心率，与 /athletes/me 的值同源。 */
  readonly restingHrFallback?: number | null;
}): readonly PhysiologyParameter[] {
  const vo2max = readings.vo2max;
  const lthr = latestThresholdValue(entries, "lthr");
  const pace = latestThresholdValue(entries, "threshold_pace");
  const hrMax = latestThresholdValue(entries, "hr_max");
  const restingThreshold = latestThresholdValue(entries, "resting_hr");

  const lthrValue = lthr?.value ?? lthrFallback;
  const hrMaxValue = hrMax?.value ?? hrMaxFallback;
  const paceValue = pace?.value ?? thresholdPaceFallback;
  const restingValue = restingThreshold?.value ?? restingHrFallback;

  return [
    {
      key: "vo2max",
      label: "最大摄氧量",
      value: vo2max ? `${vo2max.value.toFixed(1)} ml/kg/min` : null,
      source: vo2max ? "device" : null,
      dateLabel: recordedDate(vo2max?.day),
    },
    {
      key: "lthr",
      label: "乳酸阈心率 LTHR",
      value: lthrValue != null ? `${Math.round(lthrValue)} bpm` : null,
      source: lthr?.source ?? (lthrValue != null ? "estimate" : null),
      dateLabel: effectiveDate(lthr?.day),
    },
    {
      key: "threshold_pace",
      label: "阈值配速",
      value: paceValue != null ? `${formatPaceFromSeconds(Math.round(paceValue))}/km` : null,
      source: pace?.source ?? (paceValue != null ? "estimate" : null),
      dateLabel: effectiveDate(pace?.day),
    },
    {
      key: "hr_max",
      label: "最大心率 HRmax",
      value: hrMaxValue != null ? `${Math.round(hrMaxValue)} bpm` : null,
      source: hrMax?.source ?? (hrMaxValue != null ? "estimate" : null),
      dateLabel: effectiveDate(hrMax?.day),
    },
    {
      key: "resting_hr",
      label: "静息心率",
      value: restingValue != null ? `${Math.round(restingValue)} bpm` : null,
      source: restingThreshold?.source ?? (restingValue != null ? "estimate" : null),
      dateLabel: effectiveDate(restingThreshold?.day),
    },
  ];
}
