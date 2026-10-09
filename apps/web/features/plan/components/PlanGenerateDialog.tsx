"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { Button } from "@shared/ui/button";
import { PlanGenerationSettings } from "@features/plan/components/PlanGenerationSettings";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { useToast } from "@shared/ui/Toast";
import { PlanPreview, type GeneratePreview } from "@features/plan/components/plan-preview";

interface Goal {
  goal_id: string;
  title: string;
  target_date: string | null;
  race_distance_m: number | null;
  race_target_time_s: number | null;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onGenerated: () => void | Promise<void>;
  trainingDays?: number;
}

type DialogState =
  | { kind: "loading-goals" }
  | { kind: "ready" }
  | { kind: "goals-error"; message: string }
  | { kind: "previewing" }
  | { kind: "preview-error"; message: string }
  | { kind: "generating" };

export function PlanGenerateDialog({ open, onClose, onGenerated, trainingDays = 5 }: Props) {
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState("");
  const [preview, setPreview] = useState<GeneratePreview | null>(null);
  const [restDays, setRestDays] = useState(() => Math.max(0, 7 - trainingDays));
  const [preferredDaysOff, setPreferredDaysOff] = useState<number[]>([]);
  const [weeklyTss, setWeeklyTss] = useState("");
  const [state, setState] = useState<DialogState>({ kind: "loading-goals" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch<Goal[]>("/goals")
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((goal) => goal.status === "active");
        setGoals(active);
        setSelectedGoal((current) =>
          active.some((goal) => goal.goal_id === current)
            ? current
            : (active[0]?.goal_id ?? ""),
        );
        setState({ kind: "ready" });
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setGoals([]);
          setState({ kind: "goals-error", message: apiErrorMessage(caught) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selected = useMemo(
    () => goals.find((goal) => goal.goal_id === selectedGoal) ?? null,
    [goals, selectedGoal],
  );

  const planRequest = () => ({
    goal_id: selectedGoal,
    rest_days: restDays,
    preferred_days_off: preferredDaysOff,
    weekly_tss: weeklyTss ? Number(weeklyTss) : null,
  });

  const toggleDayOff = (day: number) => {
    setPreferredDaysOff((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!selectedGoal) return;
    setState({ kind: "previewing" });
    try {
      const result = await apiFetch<GeneratePreview>("/plan/generate", {
        method: "POST",
        params: { dry_run: "true" },
        body: JSON.stringify(planRequest()),
      });
      setPreview(result);
      setState({ kind: "ready" });
    } catch (caught) {
      const message = apiErrorMessage(caught);
      setState({ kind: "preview-error", message });
      toast("预览失败", "error");
    }
  };

  const handleGenerate = async () => {
    if (!selectedGoal || !preview) return;
    setState({ kind: "generating" });
    try {
      const result = await apiFetch<GeneratePreview>("/plan/generate", {
        method: "POST",
        body: JSON.stringify(planRequest()),
      });
      await onGenerated();
      toast(`已生成 ${result.events_created} 个训练`, "success");
      onClose();
    } catch (caught) {
      setState({ kind: "preview-error", message: apiErrorMessage(caught) });
      toast("生成失败", "error");
    }
  };

  const busy = state.kind === "previewing" || state.kind === "generating";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>从目标生成训练计划</DialogTitle>
          <DialogDescription>
            先查看覆盖范围，再确认写入。预览不会修改现有计划。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {state.kind === "goals-error" ? (
            <StatusPanel title="目标加载失败" body={state.message} tone="error" />
          ) : state.kind === "loading-goals" ? (
            <StatusPanel title="正在加载目标" body="读取可用于生成计划的进行中目标。" />
          ) : goals.length === 0 ? (
            <StatusPanel
              title="还没有可用目标"
              body="先创建一个进行中的比赛或训练目标，再回来生成计划。"
              action={<Link href="/goals" className="font-medium text-accent-strong hover:underline">前往目标</Link>}
            />
          ) : (
            <label className="flex flex-col gap-2" htmlFor="plan-generate-goal">
              <span className="text-subheadline font-medium text-text-primary">训练目标</span>
              <Select
                value={selectedGoal}
                onValueChange={(value) => {
                  setSelectedGoal(value);
                  setPreview(null);
                  setState({ kind: "ready" });
                }}
              >
                <SelectTrigger id="plan-generate-goal" aria-label="选择目标" className="w-full">
                  <SelectValue placeholder="选择目标" />
                </SelectTrigger>
                <SelectContent>
                  {goals.map((goal) => (
                    <SelectItem key={goal.goal_id} value={goal.goal_id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected?.target_date && (
                <span className="text-caption1 text-text-muted">目标日期 {selected.target_date}</span>
              )}
              {selected?.race_distance_m && (
                <span className="text-caption1 text-text-muted">
                  比赛距离 {(selected.race_distance_m / 1000).toFixed(2)} 公里
                  {selected.race_target_time_s
                    ? ` · 目标完赛用时 ${Math.floor(selected.race_target_time_s / 3600)}:${String(Math.floor(selected.race_target_time_s / 60) % 60).padStart(2, "0")}`
                    : ""}
                </span>
              )}
            </label>
          )}

          {goals.length > 0 && (
            <PlanGenerationSettings
              restDays={restDays}
              preferredDaysOff={preferredDaysOff}
              weeklyTss={weeklyTss}
              onRestDaysChange={(value) => { setRestDays(value); setPreview(null); }}
              onToggleDayOff={toggleDayOff}
              onWeeklyTssChange={(value) => { setWeeklyTss(value); setPreview(null); }}
            />
          )}

          {state.kind === "preview-error" && (
            <StatusPanel title="操作未完成" body={state.message} tone="error" />
          )}

          {preview && <PlanPreview preview={preview} />}

          <div className="flex flex-col-reverse gap-2 border-t border-border-default pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose}>取消</Button>
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

function StatusPanel({
  title,
  body,
  tone = "neutral",
  action,
}: {
  title: string;
  body: string;
  tone?: "neutral" | "error";
  action?: ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "error" ? "border-error/30 bg-error/5" : "border-border-default bg-surface-overlay/35"}`}>
      <p className={`text-subheadline font-semibold ${tone === "error" ? "text-error" : "text-text-primary"}`}>{title}</p>
      <p className="mt-1 text-caption1 text-text-secondary">{body}</p>
      {action && <div className="mt-3 text-caption1">{action}</div>}
    </div>
  );
}
