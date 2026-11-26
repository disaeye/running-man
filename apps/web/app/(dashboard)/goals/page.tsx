"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { ListFilter, Target } from "lucide-react";
import { Page } from "@shared/ui/PageHeader";
import { PageCard } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { useToast } from "@shared/ui/Toast";
import { apiErrorMessage } from "@shared/lib/api";
import {
  invalidateGoalDependents,
  invalidatePlanDependents,
} from "@features/data/lib/invalidate-after-sync";
import {
  useGoals,
  createGoal,
  updateGoal,
  deleteGoal,
} from "@features/goals/hooks/useGoals";
import { GoalForm, type GoalFormData } from "@features/goals/components/GoalForm";
import { GoalAbandonDialog } from "@features/goals/components/GoalAbandonDialog";
import { GoalSelector } from "@features/goals/components/GoalSelector";
import { GoalManageSheet } from "@features/goals/components/GoalManageSheet";
import { GoalDetailArea } from "@features/goals/components/GoalDetailArea";
import { GoalsPageSkeleton } from "@features/goals/components/GoalsPageSkeleton";
import { PlanGenerateDialog } from "@features/plan/components/PlanGenerateDialog";
import type { Goal } from "@shared/types/goals";

export default function GoalsPage() {
  const { goals: rawGoals, loading, error, refresh } = useGoals();
  const goals = rawGoals;
  const { mutate } = useSWRConfig();
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [abandoningGoal, setAbandoningGoal] = useState<Goal | null>(null);
  const [abandoning, setAbandoning] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = [...goals].sort((left, right) => {
    if (left.is_primary !== right.is_primary) return left.is_primary ? -1 : 1;
    if (left.status !== right.status) return left.status === "active" ? -1 : 1;
    return (right.target_date ?? "").localeCompare(left.target_date ?? "");
  });
  const detailGoal = sorted.find((goal) => goal.goal_id === selectedId) ?? sorted[0] ?? null;

  const openCreate = () => {
    setEditingGoal(null);
    setSubmitError(null);
    setFormOpen(true);
  };
  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setSubmitError(null);
    setFormOpen(true);
  };

  const handleSubmit = async (data: GoalFormData) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (editingGoal) {
        await updateGoal(editingGoal.goal_id, data);
      } else {
        const created = await createGoal(data);
        setSelectedId(created.goal_id);
      }
      setFormOpen(false);
      setEditingGoal(null);
      await invalidateGoalDependents(mutate, editingGoal?.goal_id ?? null);
      await refresh();
      toast(editingGoal ? "目标已更新" : "目标已创建", "success");
    } catch (cause) {
      setSubmitError(apiErrorMessage(cause, "保存目标失败，请重试。"));
    } finally {
      setSubmitting(false);
    }
  };

  const { toast } = useToast();

  const confirmAbandon = async () => {
    if (!abandoningGoal) return;
    const goal = abandoningGoal;
    setAbandoning(true);
    setAbandonError(null);
    try {
      await deleteGoal(goal.goal_id);
      if (selectedId === goal.goal_id) setSelectedId(null);
      setAbandoningGoal(null);
      await invalidateGoalDependents(mutate, goal.goal_id);
      await refresh();
      toast(`目标「${goal.title}」已删除`, "info");
    } catch (cause) {
      setAbandonError(apiErrorMessage(cause, `目标「${goal.title}」删除失败，请重试。`));
    } finally {
      setAbandoning(false);
    }
  };

  return (
    <Page
      title="目标"
      eyebrow="比赛与里程碑"
      right={<Button type="button" onClick={openCreate} className="rounded-full">创建目标</Button>}
    >
      {goals.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <GoalSelector
            goals={sorted}
            selectedId={detailGoal?.goal_id ?? null}
            onSelect={(id) => setSelectedId(id)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setManageOpen(true)}
            className="shrink-0 text-caption1 text-text-secondary"
          >
            <ListFilter className="size-3.5" aria-hidden />
            管理全部 ({sorted.length})
          </Button>
        </div>
      ) : null}

      {loading && rawGoals.length === 0 ? (
        <GoalsPageSkeleton />
      ) : error && rawGoals.length === 0 ? (
        <PageCard>
          <div className="py-6 text-center">
            <p role="alert" className="text-subheadline text-error">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 text-caption1 text-accent-strong hover:underline"
            >
              重新加载
            </button>
          </div>
        </PageCard>
      ) : detailGoal ? (
        <GoalDetailArea
          key={detailGoal.goal_id}
          goalId={detailGoal.goal_id}
          onGenerate={() => setGenerateOpen(true)}
        />
      ) : (
        <PageCard>
          <div className="py-6 text-center">
            <Target className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 font-semibold">还没有目标</h2>
            <p className="mt-1 text-sm text-muted-foreground">创建比赛或训练目标后，这里会显示进度、里程碑与预测。</p>
          </div>
        </PageCard>
      )}

      <GoalManageSheet
        open={manageOpen}
        goals={sorted}
        selectedId={detailGoal?.goal_id ?? null}
        onOpenChange={setManageOpen}
        onSelect={(id) => setSelectedId(id)}
        onEdit={openEdit}
        onAbandon={(goal) => {
          setAbandonError(null);
          setAbandoningGoal(goal);
        }}
      />

      <GoalForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingGoal(null); }}
        onSubmit={handleSubmit}
        editingGoal={editingGoal}
        submitting={submitting}
        submitError={submitError}
      />
      <GoalAbandonDialog
        open={abandoningGoal != null}
        goalTitle={abandoningGoal?.title ?? ""}
        abandoning={abandoning}
        error={abandonError}
        onCancel={() => setAbandoningGoal(null)}
        onConfirm={() => void confirmAbandon()}
      />
      <PlanGenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={() => {
          void Promise.all([
            invalidatePlanDependents(mutate, detailGoal?.goal_id ?? null),
            refresh(),
          ]);
        }}
        initialGoalId={detailGoal?.goal_id}
      />
    </Page>
  );
}
