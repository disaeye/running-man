"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useGoals, useGoal } from "@features/goals/hooks/useGoals";
import { useActivePlan } from "@features/goals/hooks/useActivePlan";
import { usePlanAdjustments } from "@features/goals/hooks/usePlanAdjustments";
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
import { PlanGenerateDialog } from "@features/plan/components/PlanGenerateDialog";
import { DemoActivePlanCard } from "@features/goals/components/DemoActivePlanCard";
import { DemoAdjustmentBanner } from "@features/goals/components/DemoAdjustmentBanner";
import { DemoWeekFlow } from "@features/goals/components/DemoWeekFlow";
import { DemoPlanLab } from "@features/goals/components/DemoPlanLab";
import { SampleBadge } from "@shared/dev/SampleBadge";
import { SAMPLE_DATA_ENABLED, sampleGoals } from "@shared/dev/sample-data";
import { useHasMounted } from "@shared/lib/client-date";
import { useGoalsPageHandlers } from "@features/goals/hooks/useGoalsPageHandlers";
import { athleteToday, useAthleteTimezone } from "@shared/lib/training-day";

/**
 * 目标与训练计划（按 stich_demo 的 goal.html 重排）。
 *
 * 顺序与参考稿一致：
 *   1. 动态负荷干预横幅（有建议时才出现）
 *   2. 当前激活计划卡
 *   3. 本周微周期训练流
 *   4. 智能定制新计划工作台
 *
 * 目标本身的里程碑与达成进度放在最后：计划是每天要看的东西，目标不是。
 * 每个目标仍然可以通过顶部切换器访问，已达成的目标也在列表里。
 */
export default function GoalsPage() {
  const { goals, loading, error, refresh } = useGoals();
  const mounted = useHasMounted();
  const timezone = useAthleteTimezone();
  const todayIso = athleteToday(timezone);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

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

  const plan = useActivePlan(effectiveGoalId);
  const adjustments = usePlanAdjustments();

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

  const hasPlan = plan.data != null && plan.data.goal_id != null;

  return (
    <div className="page-stack" data-testid="goals-page">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <span id="goals-title">目标与计划</span>
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
        <div className="space-y-4">
          {orderableGoals.length > 1 ? (
            <Card padding="sm">
              <GoalSelector
                goals={orderableGoals}
                selectedId={effectiveGoalId}
                onSelect={setSelectedGoalId}
              />
            </Card>
          ) : null}

          {/* 1. 动态负荷干预横幅：有建议才出现 */}
          <DemoAdjustmentBanner
            adjustments={adjustments.data}
            onDecided={adjustments.reload}
          />

          {hasPlan && plan.data ? (
            <>
              {/* 2. 当前激活计划卡 */}
              <DemoActivePlanCard plan={plan.data} />

              <div className="grid min-w-0 gap-4 lg:grid-cols-12 lg:items-start">
                <div className="min-w-0 space-y-4 lg:col-span-5">
                  {/* 4. 智能定制新计划工作台 */}
                  <DemoPlanLab
                    plan={plan.data}
                    onGenerate={() => setGenerateOpen(true)}
                  />
                </div>
                <div className="min-w-0 space-y-4 lg:col-span-7">
                  {/* 3. 本周微周期训练流 */}
                  <DemoWeekFlow plan={plan.data} todayIso={todayIso} />
                </div>
              </div>
            </>
          ) : (
            <Card padding="lg">
              <EmptyState
                icon={<FlagIcon />}
                title="这个目标还没有训练计划"
                description="生成一份计划后，这里会显示当前阶段、本周课表与配速区间。"
                action={
                  <Button
                    onClick={() => setGenerateOpen(true)}
                    className="mt-4 gap-1.5 rounded-full"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    <span>生成训练计划</span>
                  </Button>
                }
              />
            </Card>
          )}

          {/* 目标的里程碑与达成进度 */}
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
      <PlanGenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={() => {
          void refresh();
          plan.reload();
        }}
      />
    </div>
  );
}
