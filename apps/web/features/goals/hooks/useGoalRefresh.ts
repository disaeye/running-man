"use client";

import { useState, useCallback } from "react";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { apiErrorMessage } from "@shared/lib/api";
import {
  refreshGoalApiV1GoalsGoalIdRefreshPost,
  refreshAllGoalsApiV1GoalsRefreshAllPost,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { goalFromResponse } from "./useGoals";
import type { Goal } from "@shared/types/goals";

interface UseGoalRefreshResult {
  refreshGoal: (goalId: string) => Promise<Goal>;
  refreshAllGoals: () => Promise<Goal[]>;
  loading: boolean;
  error: string | null;
}

function mapGoal(raw: Generated.GoalResponseOutput): Goal {
  return goalFromResponse(raw);
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
      const msg = apiErrorMessage(err, "刷新进度失败");
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
      const msg = apiErrorMessage(err, "批量刷新失败");
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { refreshGoal, refreshAllGoals, loading, error };
}
