import { useMemo } from "react";
import { athleteToday, useAthleteTimezoneState } from "@shared/lib/training-day";
import { useWellness } from "@features/health/hooks/useWellness";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

/**
 * 设备指标（VO2max、静息心率、体重等）与训练日关联但变化缓慢，只在部分日期产生
 * 新记录。当前值一律取全历史最近一条非空记录，并携带记录日期；页面时间窗口
 * 只用于趋势序列。所有展示「当前读数」的页面共用这一个 SWR key。
 */
export interface DatedValue {
  day: string;
  value: number;
}

/** 展示当前读数所需的指标。全历史请求只取这几项。 */
export const CURRENT_READING_METRICS = [
  "vo2max",
  "resting_hr",
  "weight",
  "body_fat_pct",
] as const;

/** 全历史最近一条非空记录；wellness 数组按日升序，从末尾倒查。 */
export function latestDatedValue(
  points: readonly WellnessPoint[],
  key: keyof WellnessPoint,
): DatedValue | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    if (!point) continue;
    const value = point[key];
    if (typeof value === "number") return { day: point.day, value };
  }
  return null;
}

/** 当前读数的集合，每项都带记录日期。 */
export interface CurrentReadings {
  readonly vo2max: DatedValue | null;
  readonly restingHr: DatedValue | null;
  readonly weight: DatedValue | null;
  readonly bodyFatPct: DatedValue | null;
}

/** 纯函数，供所有调用方与测试共用同一套取值规则。 */
export function deriveCurrentReadings(points: readonly WellnessPoint[]): CurrentReadings {
  return {
    vo2max: latestDatedValue(points, "vo2max"),
    restingHr: latestDatedValue(points, "resting_hr"),
    weight: latestDatedValue(points, "weight"),
    bodyFatPct: latestDatedValue(points, "body_fat_pct"),
  };
}

/**
 * 全历史健康数据。所有调用方传入同一组参数，SWR 只发一次请求。
 */
function useWellnessHistoryState(): {
  readonly data: readonly WellnessPoint[];
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<unknown>;
} {
  const { timezone, resolved } = useAthleteTimezoneState();
  const today = resolved ? athleteToday(timezone) : "";
  const { data, loading, refreshing, error, reload } = useWellness(
    resolved ? "1970-01-01" : "",
    today,
    CURRENT_READING_METRICS,
  );
  return {
    data,
    loading: loading || !resolved,
    refreshing,
    error,
    reload: async () => reload(),
  };
}

/** 全历史健康序列，按运动员时区确定上界。趋势图用它画实际记录点。 */
export function useWellnessHistory(): readonly WellnessPoint[] {
  return useWellnessHistoryState().data;
}

export interface CurrentReadingsState extends CurrentReadings {
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<unknown>;
}

/** 所有「当前读数」消费方的唯一入口。 */
export function useCurrentReadings(): CurrentReadingsState {
  const { data, loading, refreshing, error, reload } = useWellnessHistoryState();
  const readings = useMemo(() => deriveCurrentReadings(data), [data]);
  return useMemo(
    () => ({ ...readings, loading, refreshing, error, reload }),
    [readings, loading, refreshing, error, reload],
  );
}

/** 记录日距今的天数，用于提示数据陈旧程度。 */
export function daysSince(day: string, today: string): number {
  return Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000,
  );
}
