import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";

export interface PlanGoalOption {
  goal_id: string;
  title: string;
  target_date: string | null;
  race_distance_m: number | null;
  race_target_time_s: number | null;
  status: string;
  is_primary?: boolean;
}

export function PlanGoalPicker({
  goals,
  selectedGoal,
  selected,
  onSelect,
}: {
  goals: readonly PlanGoalOption[];
  selectedGoal: string;
  selected: PlanGoalOption | null;
  onSelect: (goalId: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor="plan-generate-goal">
      <span className="text-subheadline font-medium text-text-primary">训练目标</span>
      <Select value={selectedGoal} onValueChange={onSelect}>
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
  );
}

export function PlanStatusPanel({
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
