"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useGoals, useGoal } from "@features/goals/hooks/useGoals";
import type { Goal } from "@shared/types/goals";
import { Button } from "@shared/ui/button";
import { PageHeader } from "@shared/ui/PageHeader";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { GoalForm } from "@features/goals/components/GoalForm";
import { GoalSelector } from "@features/goals/components/GoalSelector";
import { GoalsPageSkeleton } from "@features/goals/components/GoalsPageSkeleton";
import { FlagIcon } from "@features/goals/components/FlagIcon";
import { GoalsErrorBanner } from "@features/goals/components/GoalsErrorBanner";
import { GoalDetail } from "@features/goals/components/GoalDetail";
import { GoalCard } from "@features/goals/components/GoalCard";
import { RaceReadinessCard } from "@features/goals/components/RaceReadinessCard";
import { SampleBadge } from "@shared/dev/SampleBadge";
import { SAMPLE_DATA_ENABLED, sampleGoals } from "@shared/dev/sample-data";
import { useHasMounted } from "@shared/lib/client-date";
import { useGoalsPageHandlers } from "@features/goals/hooks/useGoalsPageHandlers";

/**
 * Goals: the selected target's countdown and on-track state lead, then its
 * milestones and phases. Every goal stays reachable through the selector,
 * achieved and abandoned ones included — an achieved goal is the one worth
 * revisiting.
 */
export default function GoalsPage() {
  const { goals, loading, error, refresh } = useGoals();
  const mounted = useHasMounted();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const activeGoals = useMemo(() => goals.filter((goal) => goal.status === "active"), [goals]);
  const orderableGoals = useMemo(
    () => [...activeGoals, ...goals.filter((goal) => goal.status !== "active")],
    [goals, activeGoals],
  );
  const effectiveGoalId =
    selectedGoalId ?? activeGoals[0]?.goal_id ?? goals[0]?.goal_id ?? null;

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

  // 示例目标：真实列表为空且开关打开时顶上。日期在挂载后才算：这个路由是静态
  // 预渲染的，渲染期取 `new Date()` 会把构建那天的日期写进 HTML（见 `useHasMounted`）。
  // 挂载前仍然显示原来的空态。
  const sampleGoalList = useMemo(
    () => (SAMPLE_DATA_ENABLED && mounted && goals.length === 0 ? sampleGoals(new Date()) : []),
    [mounted, goals.length],
  );
  const showingSamples = sampleGoalList.length > 0;

  if (loading) return <GoalsPageSkeleton />;

  return (
    <div className="page-stack" data-testid="goals-page">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <span id="goals-title">目标</span>
            {showingSamples ? <SampleBadge /> : null}
          </span>
        }
        action={
          goals.length > 0 || showingSamples ? (
            <Button onClick={handlers.handleOpenCreate} size="sm" className="gap-1.5 rounded-full">
              <Plus className="size-3.5" aria-hidden="true" />
              <span>创建新目标</span>
            </Button>
          ) : null
        }
      />

      <GoalsErrorBanner
        error={error}
        goalError={goalError}
        effectiveGoalId={effectiveGoalId}
        currentGoal={currentGoal}
      />

      {goals.length === 0 ? (
        showingSamples ? (
          <SampleGoalCards goals={sampleGoalList} />
        ) : (
          <Card padding="lg">
            <EmptyState
              icon={<FlagIcon />}
              title="还没有创建任何训练目标"
              description="设定一个比赛或里程碑目标后，这里会显示倒计时、阶段划分与达成进度。"
              action={
                <Button onClick={handlers.handleOpenCreate} className="mt-4 gap-1.5 rounded-full">
                  <Plus className="size-4" aria-hidden="true" />
                  <span>创建第一个目标</span>
                </Button>
              }
            />
          </Card>
        )
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

      <GoalForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={editingGoal ? handlers.handleUpdate : handlers.handleCreate}
        editingGoal={editingGoal}
      />
    </div>
  );
}

/**
 * 示例目标卡：`readOnly` 让整行操作（刷新/编辑/标记达成/放弃）不渲染——
 * 示例的 `goal_id` 在接口里不存在，入口出现在版面上只会打到 404。
 * 比赛那张再跟一张比赛准备度卡，两格读数（距比赛 / 预计完赛）才有地方显示。
 * 删除示例数据时整个函数一起删。
 */
function SampleGoalCards({ goals }: { readonly goals: readonly Goal[] }) {
  const raceGoal = goals.find((goal) => goal.type === "event") ?? null;

  return (
    <div className="space-y-6">
      {goals.map((goal) => (
        <GoalCard
          key={goal.goal_id}
          goal={goal}
          readOnly
          onEdit={noSampleAction}
          onAbandon={noSampleAction}
          onAchieve={noSampleAction}
        />
      ))}
      {raceGoal ? <RaceReadinessCard goal={raceGoal} /> : null}
    </div>
  );
}

/** 只读卡不渲染操作行，这三个回调永远不会被调用，只是 `GoalCard` 的签名需要它们。 */
function noSampleAction(): void {}
