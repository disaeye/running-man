"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useGoals, useGoal } from "@features/goals/hooks/useGoals";
import type { Goal } from "@shared/types/goals";
import { Button } from "@shared/ui/button";
import { EmptyState } from "@shared/ui/EmptyState";
import { GoalForm } from "@features/goals/components/GoalForm";
import { GoalSelector } from "@features/goals/components/GoalSelector";
import { GoalsPageSkeleton } from "@features/goals/components/GoalsPageSkeleton";
import { FlagIcon } from "@features/goals/components/FlagIcon";
import { GoalsErrorBanner } from "@features/goals/components/GoalsErrorBanner";
import { GoalDetail } from "@features/goals/components/GoalDetail";
import { Card } from "@shared/ui/Card";
import { useGoalsPageHandlers } from "@features/goals/hooks/useGoalsPageHandlers";

export default function GoalsPage() {
  const { goals, loading, error, refresh } = useGoals();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  // Achieved and abandoned goals were excluded from the picker, and the picker
  // itself was hidden unless more than one goal was active — so with no active
  // goals the page showed `goals[0]` and the athlete could not reach any other.
  // A goal that has been achieved is exactly the one worth revisiting, so every
  // goal is listed; active ones simply come first.
  // Achieved and abandoned goals were excluded from the picker, and the picker
  // itself was hidden unless more than one goal was active — so with no active
  // goals the page showed `goals[0]` and the athlete could not reach any other.
  // A goal that has been achieved is exactly the one worth revisiting, so every
  // goal is listed; active ones simply come first.
  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === "active"),
    [goals],
  );
  const orderableGoals = useMemo(
    () => [...activeGoals, ...goals.filter((g) => g.status !== "active")],
    [goals, activeGoals],
  );
  const effectiveGoalId = selectedGoalId ?? activeGoals[0]?.goal_id ?? goals[0]?.goal_id ?? null;

  const {
    goal: currentGoal,
    milestones,
    loading: milestoneLoading,
    error: goalError,
  } = useGoal(effectiveGoalId);

  const handlers = useGoalsPageHandlers({
    refresh,
    editingGoal,
    effectiveGoalId,
    milestones,
    setSelectedGoalId,
    setEditingGoal,
    setShowForm,
  });

  if (loading) return <GoalsPageSkeleton />;

  return (
    <div className="page-stack" data-testid="goals-page">
      <section className="flex flex-wrap items-end justify-between gap-6 border-b border-border-subtle pb-7" aria-labelledby="goals-title">
        <div><h1 id="goals-title" className="text-display-md text-text-primary">赛季目标与阶段里程碑</h1><p className="mt-1.5 max-w-xl text-subheadline text-text-secondary">为比赛或里程碑设定目标日期，系统据此倒推训练阶段与每周负荷。</p></div>
        {/* When the page is empty the empty state carries the only create action,
            so the header does not offer a second, differently-named copy of it. */}
        {goals.length > 0 && (
          <Button onClick={handlers.handleOpenCreate} size="sm" className="gap-1.5"><Plus className="size-3.5" /><span>创建新目标</span></Button>
        )}
      </section>
      <GoalsErrorBanner error={error} goalError={goalError} effectiveGoalId={effectiveGoalId} currentGoal={currentGoal} />
      {goals.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<FlagIcon />}
            title="还没有创建任何训练目标"
            description="设定一个比赛或里程碑目标后，这里会显示倒计时、阶段划分与达成进度。"
            action={
              <Button onClick={handlers.handleOpenCreate} className="mt-4 gap-1.5">
                <Plus className="size-4" />
                <span>创建第一个目标</span>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {orderableGoals.length > 1 && (
            <Card padding="sm">
              <GoalSelector
                goals={orderableGoals}
                selectedId={effectiveGoalId}
                onSelect={setSelectedGoalId}
              />
            </Card>
          )}
          <GoalDetail
            goal={currentGoal}
            milestones={milestones}
            milestoneLoading={milestoneLoading}
            goalError={goalError}
            onEdit={handlers.handleEdit}
            onAbandon={handlers.handleAbandon}
            onAchieve={handlers.handleAchieve}
            onToggleMilestone={handlers.handleToggleMilestone}
          />
        </div>
      )}
      <GoalForm open={showForm} onClose={() => setShowForm(false)} onSubmit={editingGoal ? handlers.handleUpdate : handlers.handleCreate} editingGoal={editingGoal} />
    </div>
  );
}
