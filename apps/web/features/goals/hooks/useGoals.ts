"use client";

import useSWR from "swr";
import { useCallback } from "react";
import { callOrval, callOrvalValidated } from "@shared/api/orval-adapter";
import {
  listGoalsApiV1GoalsGet,
  getGoalApiV1GoalsGoalIdGet,
  listMilestonesApiV1GoalsGoalIdMilestonesGet,
  createMilestoneApiV1GoalsGoalIdMilestonesPost,
  createGoalApiV1GoalsPost,
  updateGoalApiV1GoalsGoalIdPut,
  deleteGoalApiV1GoalsGoalIdDelete,
  updateMilestoneApiV1GoalsGoalIdMilestonesMilestoneIdPut,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { narrowToLiteral } from "@shared/lib/dto-nullable";
import type { Goal, GoalDirection, GoalType, GoalStatus, Milestone } from "@shared/types/goals";

const GOAL_TYPES: readonly GoalType[] = [
  "event",
  "distance",
  "time",
  "weight",
  "consistency",
];
const GOAL_STATUSES: readonly GoalStatus[] = [
  "active",
  "achieved",
  "abandoned",
];
const GOAL_DIRECTIONS: readonly GoalDirection[] = ["increase", "decrease"];

/** 把接口回应的 Goal 映射为前端类型；useGoalRefresh 与未接线的页面共用。 */
export function goalFromResponse(raw: Generated.GoalResponseOutput): Goal {
  return {
    goal_id: raw.goal_id,
    athlete_id: raw.athlete_id,
    type: narrowToLiteral(raw.type, GOAL_TYPES, "event"),
    title: raw.title,
    target_value: raw.target_value ?? null,
    current_value: raw.current_value,
    unit: raw.unit ?? null,
    start_date: raw.start_date ?? null,
    sport_key: raw.sport_key ?? null,
    is_primary: raw.is_primary ?? false,
    baseline_value: raw.baseline_value ?? null,
    direction: narrowToLiteral(raw.direction, GOAL_DIRECTIONS, "increase"),
    target_date: raw.target_date ?? null,
    race_distance_m: raw.race_distance_m ?? null,
    race_target_time_s: raw.race_target_time_s ?? null,
    race_actual_time_s: raw.race_actual_time_s ?? null,
    race_activity_id: raw.race_activity_id ?? null,
    status: narrowToLiteral(raw.status, GOAL_STATUSES, "active"),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

function mapMilestone(raw: Generated.MilestoneResponseOutput): Milestone {
  return {
    milestone_id: raw.milestone_id,
    goal_id: raw.goal_id,
    phase_id: raw.phase_id ?? null,
    title: raw.title,
    target_date: raw.target_date ?? null,
    target_value: raw.target_value ?? null,
    unit: raw.unit ?? null,
    result_text: raw.result_text ?? null,
    achieved: raw.achieved,
    achieved_at: raw.achieved_at ?? null,
  };
}

const EMPTY_GOALS: Goal[] = [];

export function useGoals() {
  const { data, error, isLoading, mutate } = useSWR<Goal[]>(["/goals", {}], {
    fetcher: () =>
      callOrvalValidated(
        (f) => listGoalsApiV1GoalsGet({}, f),
        z.array(Generated.GoalResponse),
      ).then((rows) => rows.map(goalFromResponse)),
  });
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return { goals: data ?? EMPTY_GOALS, loading: isLoading, error: error?.message ?? null, refresh };
}

export function useGoal(goalId: string | null) {
  const goalResult = useSWR<Goal>(goalId ? [`/goals/${goalId}`, {}] : null, {
    fetcher: async () => {
      if (!goalId) throw new Error("SWR guard: goalId required");
      return callOrvalValidated(
        (f) => getGoalApiV1GoalsGoalIdGet(goalId, {}, f),
        Generated.GoalResponse,
      ).then(goalFromResponse);
    },
  });
  const milestonesResult = useSWR<Milestone[]>(
    goalId ? [`/goals/${goalId}/milestones`, {}] : null,
    {
      fetcher: async () => {
        if (!goalId) throw new Error("SWR guard: goalId required");
        return callOrvalValidated(
          (f) => listMilestonesApiV1GoalsGoalIdMilestonesGet(goalId, {}, f),
          z.array(Generated.MilestoneResponse),
        ).then((rows) => rows.map(mapMilestone));
      },
    },
  );
  const refresh = useCallback(async () => {
    await Promise.all([goalResult.mutate(), milestonesResult.mutate()]);
  }, [goalResult, milestonesResult]);
  const refreshMilestones = useCallback(async () => {
    await milestonesResult.mutate();
  }, [milestonesResult]);

  return {
    goal: goalResult.data ?? null,
    milestones: milestonesResult.data ?? [],
    loading: goalResult.isLoading || milestonesResult.isLoading,
    error: goalResult.error?.message ?? milestonesResult.error?.message ?? null,
    refresh,
    refreshMilestones,
  };
}

/** 客户端可写的目标字段：结案字段（实际成绩与活动）由比赛结案接口写入。 */
export type GoalPayload = Omit<
  Goal,
  "goal_id" | "athlete_id" | "created_at" | "updated_at" | "race_actual_time_s" | "race_activity_id"
>;

export async function createGoal(payload: GoalPayload): Promise<Goal> {
  const body: Generated.GoalCreate = {
    type: payload.type,
    title: payload.title,
    target_value: payload.type === "event" ? null : payload.target_value,
    current_value: payload.current_value,
    unit: payload.type === "event" ? null : payload.unit,
    start_date: payload.start_date,
    sport_key: payload.sport_key,
    is_primary: payload.is_primary,
    baseline_value: payload.baseline_value,
    direction: payload.direction,
    target_date: payload.target_date,
    race_distance_m: payload.race_distance_m,
    race_target_time_s: payload.race_target_time_s,
    status: payload.status,
  };
  return callOrvalValidated(
    (f) => createGoalApiV1GoalsPost(body, {}, f),
    Generated.GoalResponse,
  ).then(goalFromResponse);
}

export async function updateGoal(
  goalId: string,
  payload: Partial<Goal>,
): Promise<Goal> {
  const body: Generated.GoalUpdate = {
    type: payload.type,
    title: payload.title,
    target_value: payload.type === undefined || payload.type !== "event" ? payload.target_value : null,
    current_value: payload.current_value,
    unit: payload.type === undefined || payload.type !== "event" ? payload.unit : null,
    start_date: payload.start_date,
    sport_key: payload.sport_key,
    is_primary: payload.is_primary,
    baseline_value: payload.baseline_value,
    direction: payload.direction,
    target_date: payload.target_date,
    race_distance_m: payload.race_distance_m,
    race_target_time_s: payload.race_target_time_s,
    status: payload.status,
  };
  return callOrvalValidated(
    (f) => updateGoalApiV1GoalsGoalIdPut(goalId, body, {}, f),
    Generated.GoalResponse,
  ).then(goalFromResponse);
}

export async function deleteGoal(goalId: string): Promise<void> {
  await callOrval((f) => deleteGoalApiV1GoalsGoalIdDelete(goalId, {}, f));
}

export interface MilestoneDraft {
  title: string;
  target_date: string | null;
  target_value: number | null;
  unit: string | null;
  result_text: string | null;
  /** 可选绑定阶段：阶段结束后按累计跑量自动核验。 */
  phase_id: string | null;
}

export async function createMilestone(goalId: string, draft: MilestoneDraft): Promise<Milestone> {
  return callOrvalValidated(
    (f) => createMilestoneApiV1GoalsGoalIdMilestonesPost(goalId, draft, {}, f),
    Generated.MilestoneResponse,
  ).then(mapMilestone);
}

export async function updateMilestone(
  goalId: string,
  milestoneId: string,
  draft: MilestoneDraft,
): Promise<Milestone> {
  return callOrvalValidated(
    (f) => updateMilestoneApiV1GoalsGoalIdMilestonesMilestoneIdPut(goalId, milestoneId, draft, {}, f),
    Generated.MilestoneResponse,
  ).then(mapMilestone);
}

export async function toggleMilestone(
  goalId: string,
  milestoneId: string,
  achieved: boolean,
): Promise<Milestone> {
  const body: Generated.MilestoneUpdate = { achieved };
  return callOrvalValidated(
    (f) => updateMilestoneApiV1GoalsGoalIdMilestonesMilestoneIdPut(goalId, milestoneId, body, {}, f),
    Generated.MilestoneResponse,
  ).then(mapMilestone);
}
