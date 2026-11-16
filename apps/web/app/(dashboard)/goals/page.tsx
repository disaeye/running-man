"use client";

import { useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Archive, Pencil, Target } from "lucide-react";
import { Page, PageCard, Tag } from "@shared/ui/Lovable";
import { Button } from "@shared/ui/button";
import { useToast } from "@shared/ui/Toast";
import {
  useGoals,
  createGoal,
  updateGoal,
  deleteGoal,
} from "@features/goals/hooks/useGoals";
import { GoalForm, type GoalFormData } from "@features/goals/components/GoalForm";
import { GoalAbandonDialog } from "@features/goals/components/GoalAbandonDialog";
import { GoalSelector } from "@features/goals/components/GoalSelector";
import { GoalDetailArea } from "@features/goals/components/GoalDetailArea";
import { PlanGenerateDialog } from "@features/plan/components/PlanGenerateDialog";
import { GOAL_TYPES } from "@shared/types/goals";
import type { Goal } from "@shared/types/goals";

export default function GoalsPage() {
  const { goals, refresh } = useGoals();
  const { mutate } = useSWRConfig();
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [abandoningGoal, setAbandoningGoal] = useState<Goal | null>(null);
  const [abandonError, setAbandonError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
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
        await mutate(
          (key) => Array.isArray(key) && typeof key[0] === "string" && key[0] === `/goals/${editingGoal.goal_id}`,
          undefined,
          { revalidate: true },
        );
      } else {
        const created = await createGoal(data);
        setSelectedId(created.goal_id);
      }
      setFormOpen(false);
      setEditingGoal(null);
      await refresh();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "保存目标失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  };

  const { toast, toastWithAction } = useToast();
  const abandonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirmAbandon = async () => {
    if (!abandoningGoal) return;
    const goal = abandoningGoal;
    // 先关对话框，再给 5 秒撤销窗口：没撤销才真正删除。
    setAbandoningGoal(null);
    setAbandonError(null);
    if (abandonTimerRef.current) clearTimeout(abandonTimerRef.current);
    abandonTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          await deleteGoal(goal.goal_id);
          if (selectedId === goal.goal_id) setSelectedId(null);
          await refresh();
        } catch {
          // 延迟删除失败时如实报告，不再提供二次撤销。
          toast(`目标「${goal.title}」删除失败，请重试。`, "error");
        }
      })();
    }, 5000);
    toastWithAction(
      `目标「${goal.title}」将在 5 秒后删除。`,
      "warning",
      {
        label: "撤销",
        onClick: () => {
          if (abandonTimerRef.current) {
            clearTimeout(abandonTimerRef.current);
            abandonTimerRef.current = null;
          }
        },
      },
      5000,
    );
  };

  return (
    <Page
      title="目标"
      eyebrow="比赛与里程碑"
      right={<Button type="button" onClick={openCreate} className="rounded-full">创建目标</Button>}
    >
      {goals.length > 0 ? (
        <GoalSelector
          goals={sorted}
          selectedId={detailGoal?.goal_id ?? null}
          onSelect={(id) => setSelectedId(id)}
        />
      ) : null}

      {detailGoal ? (
        <GoalDetailArea
          key={detailGoal.goal_id}
          goalId={detailGoal.goal_id}
          onEdit={() => openEdit(detailGoal)}
          onAbandon={() => { setAbandonError(null); setAbandoningGoal(detailGoal); }}
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

      {goals.length > 0 ? (
        <PageCard title="全部目标">
          <ul className="divide-y divide-border-subtle">
            {sorted.map((goal) => (
              <GoalRow
                key={goal.goal_id}
                goal={goal}
                selected={goal.goal_id === detailGoal?.goal_id}
                onSelect={() => setSelectedId(goal.goal_id)}
                onEdit={() => openEdit(goal)}
                onAbandon={() => { setAbandonError(null); setAbandoningGoal(goal); }}
              />
            ))}
          </ul>
        </PageCard>
      ) : null}

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
        abandoning={false}
        error={abandonError}
        onCancel={() => setAbandoningGoal(null)}
        onConfirm={() => void confirmAbandon()}
      />
      <PlanGenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={() => void refresh()}
      />
    </Page>
  );
}

function GoalRow({ goal, selected, onSelect, onEdit, onAbandon }: {
  goal: Goal;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onAbandon: () => void;
}) {
  const typeConfig = GOAL_TYPES[goal.type] ?? GOAL_TYPES.event;
  const statusText = goal.status === "achieved" ? "已达成" : goal.status === "abandoned" ? "已放弃" : "进行中";
  const overdue = goal.status === "active" && goal.target_date != null && goal.target_date < new Date().toISOString().slice(0, 10);
  return (
    <li className="flex items-center gap-3 py-3">
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={`h-2 w-2 shrink-0 rounded-full ${goal.status === "achieved" ? "bg-success" : goal.status === "active" ? "bg-accent-strong" : "bg-muted-foreground"}`} />
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 truncate text-sm font-medium ${selected ? "text-accent-strong" : "text-text-primary"}`}>
            {goal.title}
            {goal.is_primary ? <Tag tone="primary">主目标</Tag> : null}
            {overdue ? <Tag tone="warn">已过期</Tag> : null}
          </span>
          <span className="block text-caption1 text-text-muted">{typeConfig.label} · {statusText}{goal.target_date ? ` · ${goal.target_date}` : ""}</span>
        </span>
      </button>
      <button type="button" onClick={onEdit} aria-label={`编辑 ${goal.title}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-secondary hover:text-text-primary">
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" onClick={onAbandon} aria-label={`放弃 ${goal.title}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-error/10 hover:text-error">
        <Archive className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}
