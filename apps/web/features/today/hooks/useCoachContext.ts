"use client";

import useSWR from "swr";
import { athleteToday, useAthleteTimezoneState } from "@shared/lib/training-day";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getCoachContextApiV1InsightsCoachContextGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export type StalenessBucket = "fresh" | "stale" | "missing";

export type TrendDirection = "up" | "down" | "stable";

export interface FreshnessEntry {
  data_as_of: string | null;
  staleness_bucket: StalenessBucket;
}

export interface DataFreshness {
  activities: FreshnessEntry;
  wellness: FreshnessEntry;
}

export interface RecentLoad {
  d7_tss: number;
  d28_tss: number;
  d90_tss: number;
  current_ctl: number;
  current_atl: number;
  current_tsb: number;
  /**
   * True while CTL is still converging from the EWMA's zero seed. The value is
   * present either way, but it describes the warm-up rather than the athlete,
   * so a figure must not be presented as a measurement while this is set.
   */
  ctl_warming_up: boolean;
  ctl_history_days: number;
}

export interface RecoverySignals {
  hrv_trend_direction: TrendDirection;
  rhr_trend_direction: TrendDirection;
  sleep_avg_7d: number;
  readiness_score: number;
  /** 休息前提下 TSB 回到正区间所需的天数；投影窗口内到不了就是 null。 */
  tsb_recovery_days: number | null;
}

export interface PlanAdherence {
  completed_tss_7d: number;
  planned_tss_7d: number;
  adherence_pct: number;
}

export interface DataCaveat {
  field: string;
  issue: string;
  impact: string;
}

export interface CoachContext {
  data_freshness: DataFreshness;
  recent_load: RecentLoad;
  recovery_signals: RecoverySignals;
  plan_adherence: PlanAdherence;
  missing_data_caveats: DataCaveat[];
  recommendation: CoachRecommendation;
  readiness: CoachReadiness;
}

export interface CoachRecommendation {
  action: string;
  workout_type: string;
  duration_min: number;
  target_tss: number;
  intensity: string;
  pace_targets: CoachPaceTargets | null;
  reason: string;
  risks: string[];
  next_workout: CoachNextWorkout | null;
}

export interface CoachPaceTargets {
  intensity: string;
  min_s_per_km: number;
  max_s_per_km: number;
}

export interface CoachNextWorkout {
  name: string | null;
  sport_type: string | null;
  predicted_tss: number | null;
}

export interface CoachReadiness {
  score: number;
  level: "high" | "moderate" | "recovery" | "rest";
  factors: ReadinessFactor[];
  recommendation: string;
  max_intensity: "high" | "moderate" | "low" | "none";
  /** 当日的健康读数，与本人七日基线。 */
  readings: {
    readonly hrv: WellnessReading | null;
    readonly resting_hr: WellnessReading | null;
    readonly sleep_secs: WellnessReading | null;
  };
}

export interface WellnessReading {
  readonly value: number;
  readonly unit: string;
  readonly baseline: number | null;
  readonly delta: number | null;
  /** 实际测量日：设备分开上报各项指标，读数可能来自前一日。 */
  readonly observedOn: string | null;
}

export interface ReadinessFactor {
  name: string;
  impact: "positive" | "negative" | "neutral";
  detail: string;
}

export interface UseCoachContextResult {
  data: CoachContext | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function emptyBucket(): FreshnessEntry {
  return { data_as_of: null, staleness_bucket: "missing" };
}

function parseStalenessBucket(value: string | null): StalenessBucket {
  switch (value) {
    case "fresh":
      return "fresh";
    case "stale":
      return "stale";
    case "missing":
      return "missing";
    default:
      return "missing";
  }
}

function mapFreshness(
  raw: Record<string, Generated.CoachContextResponseOutput["data_freshness"][string]>,
): DataFreshness {
  const mapOne = (key: string): FreshnessEntry => {
    const entry = raw[key];
    if (!entry) return emptyBucket();
    return {
      data_as_of: entry.data_as_of,
      staleness_bucket: parseStalenessBucket(entry.staleness_bucket),
    };
  };
  return {
    activities: mapOne("activities"),
    wellness: mapOne("wellness"),
  };
}

function mapReading(
  raw: Generated.WellnessReadingResponseOutput | null | undefined,
): WellnessReading | null {
  if (!raw) return null;
  return {
    value: raw.value,
    unit: raw.unit,
    baseline: raw.baseline ?? null,
    delta: raw.delta ?? null,
    observedOn: raw.observed_on ?? null,
  };
}

function mapCoachContext(raw: Generated.CoachContextResponseOutput): CoachContext {
  const readings = raw.readiness.readings;
  return {
    data_freshness: mapFreshness(raw.data_freshness),
    recent_load: raw.recent_load,
    recovery_signals: {
      ...raw.recovery_signals,
      tsb_recovery_days: raw.recovery_signals.tsb_recovery_days ?? null,
    },
    plan_adherence: raw.plan_adherence,
    missing_data_caveats: raw.missing_data_caveats,
    recommendation: raw.recommendation,
    readiness: {
      ...raw.readiness,
      readings: {
        hrv: mapReading(readings?.hrv),
        resting_hr: mapReading(readings?.resting_hr),
        sleep_secs: mapReading(readings?.sleep_secs),
      },
    },
  };
}

export function useCoachContext(day?: string): UseCoachContextResult {
  // The recommendation is for the athlete's training day. Using the host's
  // calendar instead means a traveller sees yesterday's plan for their
  // workout, and an athlete east of Greenwich gets tomorrow's advice on the
  // evening before. The timezone source is the same gated one the other
  // first-wave hooks use, so the date key is settled before the first fetch.
  const { timezone, resolved } = useAthleteTimezoneState();
  const target = day ?? athleteToday(timezone);
  const params = { date: target };
  const ready = Boolean(day) || resolved;
  const { data, error, isLoading, mutate } = useSWR<CoachContext>(
    ready ? ["/insights/coach-context", { date: target }] : null,
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getCoachContextApiV1InsightsCoachContextGet(params, {}, f),
          Generated.CoachContextResponse,
        ).then(mapCoachContext),
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}
