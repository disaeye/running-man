"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Target, Trophy, Pencil, Trash2 } from "lucide-react";
import { Page, PageCard } from "@shared/ui/Lovable";
import { GoalHeroSummary } from "@features/goals/components/GoalHeroSummary";
import { useGoals, useGoal, createGoal, updateGoal, deleteGoal, createMilestone, updateMilestone, toggleMilestone } from "@features/goals/hooks/useGoals";
import { GoalForm, type GoalFormData } from "@features/goals/components/GoalForm";
import { GoalAbandonDialog } from "@features/goals/components/GoalAbandonDialog";
import { MilestoneList } from "@features/goals/components/MilestoneList";
import { PersonalRecordsHall } from "@features/goals/components/PersonalRecordsHall";
import { GoalLoadForecast } from "@features/goals/components/GoalLoadForecast";
import { GoalPhases } from "@features/goals/components/GoalPhases";
import { usePlanAdjustments } from "@features/goals/hooks/usePlanAdjustments";
import { GoalAdjustments } from "@features/goals/components/GoalAdjustments";
import { useAthleteTimezone, athleteToday } from "@shared/lib/training-day";
import { GOAL_TYPES } from "@shared/types/goals";
import type { Goal } from "@shared/types/goals";

export default function GoalsPage() {
  const { goals, refresh } = useGoals();
  const { mutate } = useSWRConfig();
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const active = goals.find((goal) => goal.status === "active") ?? null;
  const detailGoalId = selectedId ?? active?.goal_id ?? null;

  const openCreate = () => { setEditingGoal(null); setFormOpen(true); };
  const openEdit = (goal: Goal) => { setEditingGoal(goal); setFormOpen(true); };

  const handleSubmit = async (data: GoalFormData) => {
    if (editingGoal) {
      await updateGoal(editingGoal.goal_id, data);
      // 编辑后同时失效该目标的详情缓存，让 hero 卡与列表保持一致。
      await mutate(
        (key) => Array.isArray(key) && typeof key[0] === "string" && key[0] === `/goals/${editingGoal.goal_id}`,
        undefined,
        { revalidate: true },
      );
    } else {
      await createGoal({ ...data, current_value: data.current_value });
    }
    setFormOpen(false);
    setEditingGoal(null);
    await refresh();
  };

  const confirmDelete = async () => {
    if (!deletingGoal) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteGoal(deletingGoal.goal_id);
      if (selectedId === deletingGoal.goal_id) setSelectedId(null);
      setDeletingGoal(null);
      await refresh();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "删除目标失败，请重试。");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Page
      title="目标"
      eyebrow="比赛与里程碑"
      right={<button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm text-primary-foreground">创建目标</button>}
    >
      {detailGoalId ? (
        <GoalDetail goalId={detailGoalId} onEdit={() => { const g = goals.find((x) => x.goal_id === detailGoalId); if (g) openEdit(g); }} />
      ) : (
        <EmptyGoal />
      )}

      {goals.length > 0 && (
        <PageCard title="全部目标">
          <ul className="divide-y divide-border-subtle">
            {goals.map((goal) => (
              <GoalRow
                key={goal.goal_id}
                goal={goal}
                selected={goal.goal_id === detailGoalId}
                onSelect={() => setSelectedId(goal.goal_id)}
                onEdit={() => openEdit(goal)}
                onDelete={() => { setDeleteError(null); setDeletingGoal(goal); }}
              />
            ))}
          </ul>
        </PageCard>
      )}

      <GoalForm open={formOpen} onClose={() => { setFormOpen(false); setEditingGoal(null); }} onSubmit={handleSubmit} editingGoal={editingGoal} />
      <GoalAbandonDialog
        open={deletingGoal != null}
        goalTitle={deletingGoal?.title ?? ""}
        abandoning={deleting}
        error={deleteError}
        onCancel={() => { if (!deleting) setDeletingGoal(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </Page>
  );
}

function GoalRow({ goal, selected, onSelect, onEdit, onDelete }: {
  goal: Goal;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const typeConfig = GOAL_TYPES[goal.type] ?? GOAL_TYPES.event;
  const statusText = goal.status === "achieved" ? "已达成" : goal.status === "abandoned" ? "已放弃" : "进行中";
  return (
    <li className="flex items-center gap-3 py-3">
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={`h-2 w-2 shrink-0 rounded-full ${goal.status === "achieved" ? "bg-success" : goal.status === "active" ? "bg-accent-strong" : "bg-muted-foreground"}`} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${selected ? "text-accent-strong" : "text-text-primary"}`}>{goal.title}</span>
          <span className="block text-caption1 text-text-muted">{typeConfig.label} · {statusText}{goal.target_date ? ` · ${goal.target_date}` : ""}</span>
        </span>
      </button>
      <button type="button" onClick={onEdit} aria-label={`编辑 ${goal.title}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-secondary hover:text-text-primary">
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" onClick={onDelete} aria-label={`删除 ${goal.title}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-error/10 hover:text-error">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function EmptyGoal() {
  return <PageCard><div className="py-6 text-center"><Target className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">还没有进行中的目标</h2><p className="mt-1 text-sm text-muted-foreground">创建比赛或训练目标后，这里会显示里程碑与预测。</p></div></PageCard>;
}

function GoalDetail({ goalId, onEdit }: { goalId: string; onEdit: () => void }) {
  const { goal, milestones, refresh } = useGoal(goalId);
  const timezone = useAthleteTimezone();
  const adjustments = usePlanAdjustments();
  const days = goal?.target_date ? Math.max(0, Math.ceil((new Date(goal.target_date).getTime() - new Date(athleteToday(timezone)).getTime()) / 86400000)) : null;
  if (!goal) return null;
  return <div className="space-y-4"><PageCard hero><GoalHeroSummary goal={goal} days={days} /><div className="mt-3 flex justify-end"><button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 text-xs text-accent-strong"><Pencil className="h-3.5 w-3.5" />编辑目标</button></div></PageCard>{goal.target_date ? <GoalPhases goalId={goalId} today={athleteToday(timezone)} /> : null}<PageCard title="里程碑"><MilestoneList milestones={milestones} goalUnit={goal.unit} onToggle={async (id) => { await toggleMilestone(goalId, id, !milestones.find((m) => m.milestone_id === id)?.achieved); await refresh(); }} onSave={async (id, draft) => { if (id) await updateMilestone(goalId, id, draft); else await createMilestone(goalId, draft); await refresh(); }} /></PageCard><GoalLoadForecast today={athleteToday(timezone)} targetDate={goal.target_date} timezone={timezone} /><GoalAdjustments adjustments={adjustments.data} onDecided={adjustments.reload} /><PageCard title="个人荣誉室" action={<Trophy className="h-4 w-4 text-warn" />}><PersonalRecordsHall /></PageCard></div>;
}
