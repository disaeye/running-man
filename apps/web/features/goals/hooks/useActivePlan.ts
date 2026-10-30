"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getActivePlanApiV1PlanActiveGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export interface PlanPhase {
  readonly name: string;
  readonly label: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly target_weekly_distance_m: number | null;
  readonly is_current: boolean;
}

export interface PlanSession {
  readonly event_id: string;
  readonly date: string;
  readonly title: string;
  readonly training_type: string | null;
  readonly duration_min: number | null;
  readonly predicted_distance_m: number | null;
  readonly pace_min_s_km: number | null;
  readonly pace_max_s_km: number | null;
  readonly is_completed: boolean;
}

export interface PlanPaceTarget {
  readonly key: string;
  readonly label: string;
  readonly min_s_per_km: number;
  readonly max_s_per_km: number;
}

export interface ActivePlan {
  readonly goal_id: string | null;
  readonly goal_title: string | null;
  readonly goal_type: string | null;
  readonly target_date: string | null;
  readonly race_distance_m: number | null;
  readonly race_target_time_s: number | null;
  readonly phases: readonly PlanPhase[];
  readonly current_phase: PlanPhase | null;
  readonly week_start: string | null;
  readonly week_end: string | null;
  readonly week_sessions: readonly PlanSession[];
  readonly week_planned_distance_m: number | null;
  readonly week_actual_distance_m: number | null;
  readonly phase_week_number: number | null;
  readonly phase_total_weeks: number | null;
  readonly plan_progress_pct: number | null;
  readonly vdot: number | null;
  readonly training_paces: readonly PlanPaceTarget[];
  readonly long_run_day: number | null;
}

/**
 * 当前在执行的训练计划。
 *
 * 没有计划时接口返回空对象而不是报错：运动员还没生成过计划是正常状态，
 * 页面据此引导去生成，而不是显示一个失败。
 */
export function useActivePlan(goalId?: string | null): {
  data: ActivePlan | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const params = goalId ? { goal_id: goalId } : {};
  const { data, error, isLoading, mutate } = useSWR<ActivePlan>(
    ["/plan/active", params],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getActivePlanApiV1PlanActiveGet(params, {}, f),
          Generated.ActivePlanResponse,
        ).then(mapActivePlan),
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}

function mapActivePlan(raw: Generated.ActivePlanResponseOutput): ActivePlan {
  return {
    goal_id: raw.goal_id ?? null,
    goal_title: raw.goal_title ?? null,
    goal_type: raw.goal_type ?? null,
    target_date: raw.target_date ?? null,
    race_distance_m: raw.race_distance_m ?? null,
    race_target_time_s: raw.race_target_time_s ?? null,
    phases: (raw.phases ?? []).map((phase) => ({
      name: phase.name,
      label: phase.label,
      start_date: phase.start_date,
      end_date: phase.end_date,
      target_weekly_distance_m: phase.target_weekly_distance_m ?? null,
      is_current: phase.is_current,
    })),
    current_phase: raw.current_phase
      ? {
          name: raw.current_phase.name,
          label: raw.current_phase.label,
          start_date: raw.current_phase.start_date,
          end_date: raw.current_phase.end_date,
          target_weekly_distance_m: raw.current_phase.target_weekly_distance_m ?? null,
          is_current: raw.current_phase.is_current,
        }
      : null,
    week_start: raw.week_start ?? null,
    week_end: raw.week_end ?? null,
    week_sessions: (raw.week_sessions ?? []).map((session) => ({
      event_id: session.event_id,
      date: session.date,
      title: session.title,
      training_type: session.training_type ?? null,
      duration_min: session.duration_min ?? null,
      predicted_distance_m: session.predicted_distance_m ?? null,
      pace_min_s_km: session.pace_min_s_km ?? null,
      pace_max_s_km: session.pace_max_s_km ?? null,
      is_completed: session.is_completed,
    })),
    week_planned_distance_m: raw.week_planned_distance_m ?? null,
    week_actual_distance_m: raw.week_actual_distance_m ?? null,
    phase_week_number: raw.phase_week_number ?? null,
    phase_total_weeks: raw.phase_total_weeks ?? null,
    plan_progress_pct: raw.plan_progress_pct ?? null,
    vdot: raw.vdot ?? null,
    training_paces: (raw.training_paces ?? []).map((pace) => ({
      key: pace.key,
      label: pace.label,
      min_s_per_km: pace.min_s_per_km,
      max_s_per_km: pace.max_s_per_km,
    })),
    long_run_day: raw.long_run_day ?? null,
  };
}
