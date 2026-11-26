"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { PlanGenerationSettings } from "@features/plan/components/PlanGenerationSettings";
import { useGoals } from "@features/goals/hooks/useGoals";
import { useProfile } from "@features/settings/hooks/useProfile";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { useToast } from "@shared/ui/Toast";
import { PlanPreview, type GeneratePreview } from "@features/plan/components/plan-preview";
import { PlanGoalPicker, PlanStatusPanel } from "@features/plan/components/PlanStatusPanel";

interface Props {
  open: boolean;
  onClose: () => void;
  onGenerated: () => void | Promise<void>;
  trainingDays?: number;
  initialGoalId?: string | null;
}

type ActionState =
  | { kind: "ready" }
  | { kind: "previewing" }
  | { kind: "preview-error"; message: string }
  | { kind: "generating" };

type DialogState =
  | ActionState
  | { kind: "loading-goals" }
  | { kind: "goals-error"; message: string };

export function PlanGenerateDialog({
  open,
  onClose,
  onGenerated,
  trainingDays,
  initialGoalId = null,
}: Props) {
  const { toast } = useToast();
  const { profile } = useProfile();
  const goalsQuery = useGoals();
  const defaultTrainingDays = trainingDays ?? profile?.weekly_training_days ?? 5;
  const goals = useMemo(
    () =>
      goalsQuery.goals.filter(
        (goal) => goal.status === "active" && goal.target_date !== null && goal.race_distance_m !== null,
      ),
    [goalsQuery.goals],
  );
  const [selectedGoalOverride, setSelectedGoal] = useState<string>("");
  const [preview, setPreview] = useState<GeneratePreview | null>(null);
  const [restDays, setRestDays] = useState(() => Math.max(0, 7 - defaultTrainingDays));
  const [prevTrainingDays, setPrevTrainingDays] = useState(defaultTrainingDays);
  const [preferredDaysOff, setPreferredDaysOff] = useState<number[]>([]);
  const [longRunDay, setLongRunDay] = useState<number | null>(null);
  const [actionState, setActionState] = useState<ActionState>({ kind: "ready" });
  const [wasOpen, setWasOpen] = useState(open);

  if (prevTrainingDays !== defaultTrainingDays) {
    setPrevTrainingDays(defaultTrainingDays);
    setRestDays(Math.max(0, 7 - defaultTrainingDays));
  }
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setPreview(null);
      setActionState({ kind: "ready" });
    }
  }

  const selectedGoal = useMemo(() => {
    if (selectedGoalOverride && goals.some((g) => g.goal_id === selectedGoalOverride)) {
      return selectedGoalOverride;
    }
    if (initialGoalId && goals.some((g) => g.goal_id === initialGoalId)) {
      return initialGoalId;
    }
    return goals[0]?.goal_id ?? "";
  }, [goals, initialGoalId, selectedGoalOverride]);

  const state: DialogState =
    actionState.kind !== "ready"
      ? actionState
      : goalsQuery.error
        ? { kind: "goals-error", message: goalsQuery.error }
        : goalsQuery.loading && goalsQuery.goals.length === 0
          ? { kind: "loading-goals" }
          : { kind: "ready" };

  const selected = useMemo(
    () => goals.find((goal) => goal.goal_id === selectedGoal) ?? null,
    [goals, selectedGoal],
  );

  const planRequest = () => ({
    goal_id: selectedGoal,
    rest_days: restDays,
    preferred_days_off: preferredDaysOff,
    long_run_day: longRunDay,
  });

  const toggleDayOff = (day: number) => {
    setPreferredDaysOff((current) => {
      const next = current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day];
      if (!current.includes(day)) {
        if (longRunDay === day) setLongRunDay(null);
        if (next.length > restDays) setRestDays(Math.min(6, next.length));
      }
      return next;
    });
    setPreview(null);
  };

  const handleLongRunDayChange = (day: number | null) => {
    setLongRunDay(day);
    if (day != null) {
      setPreferredDaysOff((current) => current.filter((value) => value !== day));
    }
    setPreview(null);
  };
  const handlePreview = async () => {
    if (!selectedGoal) return;
    setActionState({ kind: "previewing" });
    try {
      const result = await apiFetch<GeneratePreview>("/plan/generate", {
        method: "POST",
        params: { dry_run: "true" },
        body: JSON.stringify(planRequest()),
      });
      setPreview(result);
      setActionState({ kind: "ready" });
    } catch (caught) {
      const message = apiErrorMessage(caught);
      setActionState({ kind: "preview-error", message });
      toast("预览失败", "error");
    }
  };

  const handleGenerate = async () => {
    if (!selectedGoal || !preview) return;
    setActionState({ kind: "generating" });
    try {
      const result = await apiFetch<GeneratePreview>("/plan/generate", {
        method: "POST",
        body: JSON.stringify(planRequest()),
      });
      await onGenerated();
      toast(`已生成 ${result.events_created} 个训练`, "success");
      onClose();
    } catch (caught) {
      setActionState({ kind: "preview-error", message: apiErrorMessage(caught) });
      toast("生成失败", "error");
    }
  };

  const busy = state.kind === "previewing" || state.kind === "generating";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onClose(); }}>
      <DialogContent className={preview ? "sm:max-w-3xl" : "sm:max-w-lg"} mobileSheet>
        <DialogHeader>
          <DialogTitle>从目标生成训练计划</DialogTitle>
          <DialogDescription>
            先查看覆盖范围，再确认写入。预览不会修改现有计划。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className={preview ? "grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:items-start" : "flex flex-col gap-5"}>
            <div className="flex flex-col gap-5">
              {state.kind === "goals-error" ? (
                <PlanStatusPanel title="目标加载失败" body={state.message} tone="error" />
              ) : state.kind === "loading-goals" ? (
                <PlanStatusPanel title="正在加载目标" body="读取日期与距离齐全的进行中比赛目标。" />
              ) : goals.length === 0 ? (
                <PlanStatusPanel
                  title="没有资料完整的比赛目标"
                  body="请为目标填写比赛日期和距离，再生成训练计划。"
                  action={<Link href="/goals" className="font-medium text-accent-strong hover:underline">前往目标</Link>}
                />
              ) : (
                <PlanGoalPicker
                  goals={goals}
                  selectedGoal={selectedGoal}
                  selected={selected}
                  onSelect={(value) => {
                    setSelectedGoal(value);
                    setPreview(null);
                    setActionState({ kind: "ready" });
                  }}
                />
              )}

              {goals.length > 0 && (
                <PlanGenerationSettings
                  restDays={restDays}
                  preferredDaysOff={preferredDaysOff}
                  longRunDay={longRunDay}
                  onRestDaysChange={(value) => { setRestDays(value); setPreview(null); }}
                  onToggleDayOff={toggleDayOff}
                  onLongRunDayChange={handleLongRunDayChange}
                />
              )}

              {state.kind === "preview-error" && (
                <PlanStatusPanel title="操作未完成" body={state.message} tone="error" />
              )}
            </div>

            {preview && <PlanPreview preview={preview} />}
          </div>

          <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 flex flex-col-reverse gap-2 border-t border-border-default bg-surface-card px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
            <Button
              onClick={preview ? handleGenerate : handlePreview}
              disabled={!selectedGoal || busy || state.kind === "loading-goals" || state.kind === "goals-error"}
            >
              {state.kind === "previewing"
                ? "正在预览…"
                : state.kind === "generating"
                  ? "正在生成…"
                  : preview
                    ? "确认生成"
                    : "预览计划"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
