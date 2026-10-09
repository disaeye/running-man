"use client";

import { useState, useCallback } from "react";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {
  refreshGoalApiV1GoalsGoalIdRefreshPost,
  refreshAllGoalsApiV1GoalsRefreshAllPost,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { narrowToLiteral } from "@shared/lib/dto-nullable";
import type { Goal, GoalType, GoalStatus } from "@shared/types/goals";

interface UseGoalRefreshResult {
  refreshGoal: (goalId: string) => Promise<Goal>;
  refreshAllGoals: () => Promise<Goal[]>;
  loading: boolean;
  error: string | null;
}

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

export function useGoalRefresh(): UseGoalRefreshResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshGoal = useCallback(async (goalId: string): Promise<Goal> => {
    setLoading(true);
    setError(null);
    try {
      const updated = await callOrvalValidated(
        (f) => refreshGoalApiV1GoalsGoalIdRefreshPost(goalId, {}, f),
        Generated.GoalResponse,
      );
      return mapGoal(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "刷新进度失败";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAllGoals = useCallback(async (): Promise<Goal[]> => {
    setLoading(true);
    setError(null);
    try {
      const updated = await callOrvalValidated(
        (f) => refreshAllGoalsApiV1GoalsRefreshAllPost({}, f),
        z.array(Generated.GoalResponse),
      );
      return updated.map(mapGoal);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "批量刷新失败";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { refreshGoal, refreshAllGoals, loading, error };
}
