"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useGoals, useGoal } from "@features/goals/hooks/useGoals";
import { useActivePlan } from "@features/goals/hooks/useActivePlan";
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
import { DemoWeekFlow } from "@features/goals/components/DemoWeekFlow";
import { DemoPlanLab } from "@features/goals/components/DemoPlanLab";
import { SampleBadge } from "@shared/dev/SampleBadge";
import { SAMPLE_DATA_ENABLED, sampleGoals } from "@shared/dev/sample-data";
import { useHasMounted } from "@shared/lib/client-date";
import { useGoalsPageHandlers } from "@features/goals/hooks/useGoalsPageHandlers";
import { athleteToday, useAthleteTimezone } from "@shared/lib/training-day";

/**
 * 目标页组合实际目标、里程碑和训练安排。
 * 每个目标由顶部选择器切换，赛事资料以用户填写的真实信息为准。
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
    refresh: refreshGoal,
    refreshMilestones,
  } = useGoal(effectiveGoalId);

  const plan = useActivePlan(effectiveGoalId);
  const handlers = useGoalsPageHandlers({
    refresh,
    editingGoal,
    effectiveGoalId,
    milestones,
    refreshMilestones,
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
            <span id="goals-title">目标</span>
            {showingSamples ? <SampleBadge /> : null}
          </span>
        }
        description="管理赛事目标、训练阶段与里程碑。"
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
        <div className="space-y-6">
          {orderableGoals.length > 1 ? (
            <section aria-label="选择目标" className="space-y-2">
              <h2 className="text-caption1 font-medium text-text-secondary">你的目标</h2>
              <GoalSelector
                goals={orderableGoals}
                selectedId={effectiveGoalId}
                onSelect={setSelectedGoalId}
              />
            </section>
          ) : null}

          {currentGoal ? (
            <GoalDetail
              goal={currentGoal}
              milestones={milestones}
              milestoneLoading={milestoneLoading}
              goalError={goalError}
              onEdit={handlers.handleEdit}
              onAbandon={handlers.handleAbandon}
              onAchieve={handlers.handleAchieve}
              onToggleMilestone={handlers.handleToggleMilestone}
              onSaveMilestone={handlers.handleSaveMilestone}
            />
          ) : goalError ? (
            <GoalsErrorBanner
              error={null}
              goalError={goalError}
              effectiveGoalId={effectiveGoalId}
              currentGoal={currentGoal}
            />
          ) : (
            <div className="h-40 animate-pulse rounded-xl bg-surface-raised" aria-label="正在读取目标资料" />
          )}

          <section aria-labelledby="goal-plan-title" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="goal-plan-title" className="text-title2 font-semibold text-text-primary">训练安排</h2>
                <p className="mt-1 text-caption1 text-text-muted">查看当前阶段、本周课表与训练配速。</p>
              </div>
              {hasPlan && plan.data ? (
                <Button
                  variant="outline"
                  onClick={() => setGenerateOpen(true)}
                  disabled={!currentGoal?.target_date || currentGoal.status !== "active"}
                  title={!currentGoal?.target_date ? "请先填写目标日期" : undefined}
                >
                  调整训练计划
                </Button>
              ) : null}
            </div>

            {hasPlan && plan.data ? (
              <>
                <DemoActivePlanCard plan={plan.data} />
                <div className="grid min-w-0 gap-4">
                  <div className="min-w-0 space-y-4">
                    <DemoWeekFlow plan={plan.data} todayIso={todayIso} />
                  </div>
                  <div className="min-w-0 space-y-4">
                    <DemoPlanLab
                      plan={plan.data}
                      onGenerate={() => setGenerateOpen(true)}
                      canGenerate={Boolean(currentGoal?.target_date && currentGoal.status === "active")}
                      onEditGoal={() => currentGoal && handlers.handleEdit(currentGoal)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <Card padding="lg">
                <EmptyState
                  icon={<FlagIcon />}
                  title="尚无训练计划"
                  description={currentGoal?.target_date
                    ? "生成计划后，这里会显示训练阶段、本周课表和配速安排。"
                    : "填写目标日期后，才能根据赛事时间安排训练阶段。"}
                  action={currentGoal?.target_date ? (
                    <Button
                      onClick={() => setGenerateOpen(true)}
                      className="mt-4 gap-1.5 rounded-full"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      <span>生成训练计划</span>
                    </Button>
                  ) : currentGoal ? (
                    <Button onClick={() => handlers.handleEdit(currentGoal)} className="mt-4">
                      填写目标日期
                    </Button>
                  ) : null}
                />
              </Card>
            )}
          </section>
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
          void refreshGoal();
          plan.reload();
        }}
      />
    </div>
  );
}
