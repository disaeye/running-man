"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getActivityAnalysisApiV1ActivitiesActivityIdAnalysisGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export interface Lap {
  lap_index: number;
  distance_m: number;
  /** 分段实际时长（秒）。时间戳缺失时为 null——样本点数不是时长。 */
  duration_s: number | null;
  avg_hr: number | null;
  avg_power: number | null;
  /** 平均速度（m/s），由分段距离与时长算出。 */
  avg_speed: number | null;
  /** 分段配速（秒/公里）。 */
  pace_s_per_km: number | null;
  avg_pace?: number | null;
  elevation_gain?: number | null;
}

export interface HrZones {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

/** 一个心率区间的驻留时间与区间边界。 */
export interface ZoneResidence {
  zone: number;
  seconds: number;
  pct: number;
  min_bpm: number | null;
  max_bpm: number | null;
}

/** 跑步动力学矩阵。每项在设备未采集时为 null。 */
export interface Biomechanics {
  avg_cadence_spm: number | null;
  avg_stride_length_m: number | null;
  avg_vertical_oscillation_cm: number | null;
  avg_ground_contact_time_ms: number | null;
  avg_lr_balance_pct: number | null;
  sample_counts: {
    cadence: number;
    stride_length: number;
    vertical_oscillation: number;
    ground_contact_time: number;
    left_right_balance: number;
  };
}

export interface PowerCurvePoint {
  duration_s: number;
  avg_w: number;
}

export interface AnalysisSummary {
  np: number | null;
  if_val: number | null;
  tss: number | null;
  decoupling_pct: number | null;
}

export interface ActivityAnalysis {
  laps: Lap[];
  hr_zones: HrZones | null;
  power_curve: PowerCurvePoint[];
  summary: AnalysisSummary | null;
  /** 配速波动（秒/公里）。样本不足时为 null。 */
  pace_variation_s: number | null;
  /** 最快分段的分段序号。 */
  fastest_lap_index: number | null;
  /** 心率五区间驻留。 */
  zone_residence: ZoneResidence[];
  /** 主导区间。 */
  dominant_zone: number | null;
  /** 跑步动力学。 */
  biomechanics: Biomechanics;
}

function mapAnalysis(raw: Generated.ActivityAnalysisResponseOutput): ActivityAnalysis {
  return {
    laps: raw.laps.map((lap) => ({
      lap_index: lap.lap_index,
      distance_m: lap.distance_m,
      duration_s: lap.duration_s ?? null,
      avg_hr: lap.avg_hr,
      avg_power: lap.avg_power,
      avg_speed: lap.avg_speed ?? null,
      pace_s_per_km:
        lap.pace_s_per_km ??
        (lap.distance_m > 0 && lap.duration_s != null && lap.duration_s > 0
          ? (lap.duration_s * 1000) / lap.distance_m
          : null),
      avg_pace: lap.distance_m > 0 && lap.duration_s != null && lap.duration_s > 0
        ? (lap.duration_s * 1000) / lap.distance_m
        : null,
      elevation_gain: null,
    })),
    hr_zones: raw.hr_zones,
    power_curve: raw.power_curve,
    summary: raw.summary
      ? {
          np: raw.summary.np,
          if_val: raw.summary.if,
          tss: raw.summary.tss,
          decoupling_pct: raw.summary.decoupling_pct ?? null,
        }
      : null,
    pace_variation_s: raw.pace_variation_s ?? null,
    fastest_lap_index: raw.fastest_lap_index ?? null,
    zone_residence: (raw.zone_residence ?? []).map((zone) => ({
      zone: zone.zone,
      seconds: zone.seconds,
      pct: zone.pct,
      min_bpm: zone.min_bpm ?? null,
      max_bpm: zone.max_bpm ?? null,
    })),
    dominant_zone: raw.dominant_zone ?? null,
    biomechanics: {
      avg_cadence_spm: raw.biomechanics?.avg_cadence_spm ?? null,
      avg_stride_length_m: raw.biomechanics?.avg_stride_length_m ?? null,
      avg_vertical_oscillation_cm:
        raw.biomechanics?.avg_vertical_oscillation_cm ?? null,
      avg_ground_contact_time_ms:
        raw.biomechanics?.avg_ground_contact_time_ms ?? null,
      avg_lr_balance_pct: raw.biomechanics?.avg_lr_balance_pct ?? null,
      sample_counts: {
        cadence: raw.biomechanics?.sample_counts?.cadence ?? 0,
        stride_length: raw.biomechanics?.sample_counts?.stride_length ?? 0,
        vertical_oscillation:
          raw.biomechanics?.sample_counts?.vertical_oscillation ?? 0,
        ground_contact_time:
          raw.biomechanics?.sample_counts?.ground_contact_time ?? 0,
        left_right_balance:
          raw.biomechanics?.sample_counts?.left_right_balance ?? 0,
      },
    },
  };
}

export function useActivityAnalysis(id: string | undefined) {
  const { data, error, isLoading } = useSWR<ActivityAnalysis>(
    id ? [`/activities/${id}/analysis`, {}] : null,
    {
      fetcher: async () => {
        if (!id) throw new Error("SWR guard: id required");
        return callOrvalValidated(
          (f) => getActivityAnalysisApiV1ActivitiesActivityIdAnalysisGet(id, {}, f),
          Generated.ActivityAnalysisResponse,
        ).then(mapAnalysis);
      },
    },
  );

  return { data: data ?? null, loading: isLoading, error: error?.message ?? null };
}
