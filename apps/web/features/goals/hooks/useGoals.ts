"use client";

import useSWR from "swr";
import { useCallback } from "react";
import { callOrval, callOrvalValidated } from "@shared/api/orval-adapter";
import {
  listGoalsApiV1GoalsGet,
  getGoalApiV1GoalsGoalIdGet,
  listMilestonesApiV1GoalsGoalIdMilestonesGet,
  createGoalApiV1GoalsPost,
  updateGoalApiV1GoalsGoalIdPut,
  deleteGoalApiV1GoalsGoalIdDelete,
  updateMilestoneApiV1GoalsGoalIdMilestonesMilestoneIdPut,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { narrowToLiteral } from "@shared/lib/dto-nullable";
import type { Goal, GoalType, GoalStatus, Milestone } from "@shared/types/goals";

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

function mapGoal(raw: Generated.GoalResponseOutput): Goal {
  return {
    goal_id: raw.goal_id,
    athlete_id: raw.athlete_id,
    type: narrowToLiteral(raw.type, GOAL_TYPES, "event"),
    title: raw.title,
    target_value: raw.target_value ?? null,
    current_value: raw.current_value,
    unit: raw.unit ?? null,
    target_date: raw.target_date ?? null,
    race_distance_m: raw.race_distance_m ?? null,
    race_target_time_s: raw.race_target_time_s ?? null,
    status: narrowToLiteral(raw.status, GOAL_STATUSES, "active"),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

function mapMilestone(raw: Generated.MilestoneResponseOutput): Milestone {
  return {
    milestone_id: raw.milestone_id,
    goal_id: raw.goal_id,
    title: raw.title,
    target_date: raw.target_date ?? null,
    target_value: raw.target_value ?? null,
    achieved: raw.achieved,
    achieved_at: raw.achieved_at ?? null,
  };
}

export function useGoals() {
  const { data, error, isLoading, mutate } = useSWR<Goal[]>(["/goals", {}], {
    fetcher: () =>
      callOrvalValidated(
        (f) => listGoalsApiV1GoalsGet({}, f),
        z.array(Generated.GoalResponse),
      ).then((rows) => rows.map(mapGoal)),
  });
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return { goals: data ?? [], loading: isLoading, error: error?.message ?? null, refresh };
}

export function useGoal(goalId: string | null) {
  const goalResult = useSWR<Goal>(goalId ? [`/goals/${goalId}`, {}] : null, {
    fetcher: async () => {
      if (!goalId) throw new Error("SWR guard: goalId required");
      return callOrvalValidated(
        (f) => getGoalApiV1GoalsGoalIdGet(goalId, {}, f),
        Generated.GoalResponse,
      ).then(mapGoal);
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

  return {
    goal: goalResult.data ?? null,
    milestones: milestonesResult.data ?? [],
    loading: goalResult.isLoading || milestonesResult.isLoading,
    error: goalResult.error?.message ?? milestonesResult.error?.message ?? null,
    refresh,
  };
}

export async function createGoal(
  payload: Omit<Goal, "goal_id" | "athlete_id" | "created_at" | "updated_at">,
): Promise<Goal> {
  const body: Generated.GoalCreate = {
    type: payload.type,
    title: payload.title,
    target_value: payload.target_value,
    current_value: payload.current_value,
    unit: payload.unit,
    target_date: payload.target_date,
    race_distance_m: payload.race_distance_m,
    race_target_time_s: payload.race_target_time_s,
    status: payload.status,
  };
  return callOrvalValidated(
    (f) => createGoalApiV1GoalsPost(body, {}, f),
    Generated.GoalResponse,
  ).then(mapGoal);
}

export async function updateGoal(
  goalId: string,
  payload: Partial<Goal>,
): Promise<Goal> {
  const body: Generated.GoalUpdate = {
    type: payload.type,
    title: payload.title,
    target_value: payload.target_value,
    current_value: payload.current_value,
    unit: payload.unit,
    target_date: payload.target_date,
    race_distance_m: payload.race_distance_m,
    race_target_time_s: payload.race_target_time_s,
    status: payload.status,
  };
  return callOrvalValidated(
    (f) => updateGoalApiV1GoalsGoalIdPut(goalId, body, {}, f),
    Generated.GoalResponse,
  ).then(mapGoal);
}

export async function deleteGoal(goalId: string): Promise<void> {
  await callOrval((f) => deleteGoalApiV1GoalsGoalIdDelete(goalId, {}, f));
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
