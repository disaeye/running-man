"use client";

import useSWR from "swr";
import { runtimeFetch } from "@shared/api/transport";
import type { MetricSeriesResponseOutput } from "@shared/api/generated/model";

export interface WellnessPoint {
  day: string;
  resting_hr: number | null;
  hrv: number | null;
  hrv_sdnn: number | null;
  weight: number | null;
  body_fat_pct: number | null;
  sleep_secs: number | null;
  sleep_score: number | null;
  sleep_quality: number | null;
  avg_sleeping_hr: number | null;
  steps: number | null;
  vo2max: number | null;
  spo2: number | null;
  respiration_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  kcal_consumed: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  hydration: number | null;
  menstrual_phase: number | null;
  menstrual_phase_predicted: number | null;
  fatigue: number | null;
  soreness: number | null;
  stress: number | null;
  mood: number | null;
  motivation: number | null;
  injury_status: number | null;
  source_readiness: number | null;
}

interface BatchResponse {
  grain: string;
  series: MetricSeriesResponseOutput[];
}

const WELLNESS_METRICS = [
  "resting_hr",
  "hrv",
  "hrv_sdnn",
  "weight",
  "body_fat_pct",
  "sleep_secs",
  "sleep_score",
  "sleep_quality",
  "avg_sleeping_hr",
  "steps",
  "vo2max",
  "spo2",
  "respiration_rate",
  "systolic_bp",
  "diastolic_bp",
  "kcal_consumed",
  "carbs_g",
  "protein_g",
  "fat_g",
  "hydration",
  "menstrual_phase",
  "menstrual_phase_predicted",
  "fatigue",
  "soreness",
  "stress",
  "mood",
  "motivation",
  "injury_status",
  "source_readiness",
] as const;

/** 没有数据或范围未定时的稳定空数组，避免消费方的 effect 每次渲染重跑。 */
const EMPTY_WELLNESS_POINTS: WellnessPoint[] = [];

/**
 * Fetches wellness data via the EAV fact-stream API (/metrics/series/batch).
 *
 * Requests all wellness metrics in a single batch call, then pivots the
 * per-metric EAV series back into the WellnessPoint[] shape that consumers
 * expect. Metrics not present in the response default to null.
 */
export function useWellness(
  from: string,
  to: string,
  metrics: readonly string[] = WELLNESS_METRICS,
) {
  const params = { metrics: metrics.join(","), grain: "daily", from, to };
  // 空范围代表「日期还没定」，不是请求全部：后端对缺参回答 422。
  const hasRange = Boolean(from && to);
  const { data, error, isLoading, isValidating, mutate } = useSWR<WellnessPoint[]>(
    hasRange ? ["/metrics/series/batch", params] : null,
    {
      fetcher: async () => {
        const search = new URLSearchParams({
          metrics: params.metrics,
          grain: params.grain,
          from,
          to,
        });
        const res = await runtimeFetch(`/api/v1/metrics/series/batch?${search}`);
        if (!res.ok) {
          throw new Error(`健康数据加载失败 (${res.status})`);
        }
        const batch: BatchResponse = await res.json();
        return pivotToWellnessPoints(Array.isArray(batch?.series) ? batch.series : []);
      },
    },
  );

  return {
    data: data ?? EMPTY_WELLNESS_POINTS,
    loading: hasRange && isLoading,
    refreshing: hasRange && isValidating,
    error: error?.message ?? null,
    reload: () => mutate(),
  };
}

function emptyPoint(day: string): WellnessPoint {
  return {
    day,
    resting_hr: null,
    hrv: null,
    hrv_sdnn: null,
    weight: null,
    body_fat_pct: null,
    sleep_secs: null,
    sleep_score: null,
    sleep_quality: null,
    avg_sleeping_hr: null,
    steps: null,
    vo2max: null,
    spo2: null,
    respiration_rate: null,
    systolic_bp: null,
    diastolic_bp: null,
    kcal_consumed: null,
    carbs_g: null,
    protein_g: null,
    fat_g: null,
    hydration: null,
    menstrual_phase: null,
    menstrual_phase_predicted: null,
    fatigue: null,
    soreness: null,
    stress: null,
    mood: null,
    motivation: null,
    injury_status: null,
    source_readiness: null,
  };
}

type WellnessValueField = Exclude<keyof WellnessPoint, "day">;

/**
 * Pivot per-metric EAV series into per-day wellness points.
 * Each metric series contributes one column per day; days with no
 * data in any metric are omitted.
 */
function pivotToWellnessPoints(
  series: MetricSeriesResponseOutput[],
): WellnessPoint[] {
  const byDay = new Map<string, WellnessPoint>();

  for (const response of series) {
    const metricKey = response.metric as WellnessValueField;
    for (const point of response.points) {
      const day = point.period;
      let entry = byDay.get(day);
      if (entry == null) {
        entry = emptyPoint(day);
        byDay.set(day, entry);
      }
      entry[metricKey] = point.value;
    }
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}
