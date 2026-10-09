"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  createGoal,
  updateGoal,
  deleteGoal,
  toggleMilestone,
} from "@features/goals/hooks/useGoals";
import type { Goal, Milestone } from "@shared/types/goals";
import type { GoalFormData } from "@features/goals/components/GoalForm";

export interface UseGoalsPageHandlersDeps {
  refresh: () => Promise<void>;
  editingGoal: Goal | null;
  effectiveGoalId: string | null;
  milestones: Milestone[];
  setSelectedGoalId: Dispatch<SetStateAction<string | null>>;
  setEditingGoal: Dispatch<SetStateAction<Goal | null>>;
  setShowForm: Dispatch<SetStateAction<boolean>>;
}

export interface UseGoalsPageHandlersResult {
  handleCreate: (data: GoalFormData) => Promise<void>;
  handleUpdate: (data: GoalFormData) => Promise<void>;
  handleEdit: (goal: Goal) => void;
  handleAchieve: (goal: Goal) => Promise<void>;
  handleAbandon: (goal: Goal) => Promise<void>;
  handleToggleMilestone: (milestoneId: string) => Promise<void>;
  handleOpenCreate: () => void;
}

/** All GoalsPage action handlers in one place. Bodies are verbatim from
 *  the pre-extraction page; behavior is locked by page.test.tsx. */
export function useGoalsPageHandlers(deps: UseGoalsPageHandlersDeps): UseGoalsPageHandlersResult {
  const {
    refresh,
    editingGoal,
    effectiveGoalId,
    milestones,
    setSelectedGoalId,
    setEditingGoal,
    setShowForm,
  } = deps;

  const handleCreate = useCallback(async (data: GoalFormData) => {
    await createGoal({ ...data, current_value: data.current_value });
    setShowForm(false);
    await refresh();
  }, [refresh, setShowForm]);

  const handleUpdate = useCallback(async (data: GoalFormData) => {
    if (!editingGoal) return;
    await updateGoal(editingGoal.goal_id, data);
    setEditingGoal(null);
    setShowForm(false);
    await refresh();
  }, [editingGoal, refresh, setEditingGoal, setShowForm]);

  const handleEdit = useCallback((goal: Goal) => {
    setEditingGoal(goal);
    setShowForm(true);
  }, [setEditingGoal, setShowForm]);

  const handleAchieve = useCallback(async (goal: Goal) => {
    await updateGoal(goal.goal_id, { status: "achieved" });
    await refresh();
  }, [refresh]);

  const handleAbandon = useCallback(async (goal: Goal) => {
    await deleteGoal(goal.goal_id);
    setSelectedGoalId(null);
    await refresh();
  }, [refresh, setSelectedGoalId]);

  const handleToggleMilestone = useCallback(async (milestoneId: string) => {
    if (!effectiveGoalId) return;
    const ms = milestones.find((m) => m.milestone_id === milestoneId);
    if (!ms) return;
    await toggleMilestone(effectiveGoalId, milestoneId, !ms.achieved);
    await refresh();
  }, [effectiveGoalId, milestones, refresh]);

  const handleOpenCreate = useCallback(() => {
    setEditingGoal(null);
    setShowForm(true);
  }, [setEditingGoal, setShowForm]);

  return {
    handleCreate,
    handleUpdate,
    handleEdit,
    handleAchieve,
    handleAbandon,
    handleToggleMilestone,
    handleOpenCreate,
  };
}
