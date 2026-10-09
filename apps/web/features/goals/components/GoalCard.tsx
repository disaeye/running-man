"use client";

import { useState } from "react";
import { Flag, Flame, Ruler, Scale, Timer, type LucideIcon } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { Progress } from "@shared/ui/Progress";
import { Button } from "@shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import type { Goal } from "@shared/types/goals";
import { GOAL_TYPES } from "@shared/types/goals";
import { formatRelativeTime } from "@shared/lib/format";
import { useGoalRefresh } from "@features/goals/hooks/useGoalRefresh";
import { RefreshSpinner } from "./RefreshSpinner";
import {
  goalProgress,
  daysRemaining,
  computeGoalStatus,
  statusLabel,
  statusVariant,
} from "./goal-utils";

const GOAL_ICON_MAP: Record<string, LucideIcon> = {
  Flag,
  Ruler,
  Timer,
  Scale,
  Flame,
};

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  /** Destructive, idempotent — deletes the goal and refreshes the parent list. Confirmed via in-card dialog. */
  onAbandon: (goal: Goal) => void | Promise<void>;
  onAchieve: (goal: Goal) => void;
}

export function GoalCard({ goal, onEdit, onAbandon, onAchieve }: GoalCardProps) {
  const { refreshGoal, loading: refreshLoading } = useGoalRefresh();
  const [localGoal, setLocalGoal] = useState<Goal>(goal);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  const displayGoal = localGoal.goal_id === goal.goal_id && goal.updated_at >= localGoal.updated_at ? goal : localGoal;

  const progress = goalProgress(displayGoal);
  const days = daysRemaining(displayGoal.target_date);
  const status = computeGoalStatus(displayGoal);
  const typeConfig = GOAL_TYPES[displayGoal.type] ?? GOAL_TYPES.event;
  const GoalIcon = GOAL_ICON_MAP[typeConfig.icon] ?? null;
  const isAchieved = displayGoal.status === "achieved";
  const lastUpdated = formatRelativeTime(displayGoal.updated_at);

  const handleRefresh = async () => {
    setRefreshError(null);
    try {
      const updated = await refreshGoal(displayGoal.goal_id);
      setLocalGoal(updated);
    } catch {
      setRefreshError("刷新失败，请稍后再试");
    }
  };

  const requestAbandon = () => setAbandonOpen(true);

  const cancelAbandon = () => {
    if (abandoning) return;
    setAbandonOpen(false);
  };

  const confirmAbandon = async () => {
    setAbandoning(true);
    try {
      await onAbandon(displayGoal);
      setAbandonOpen(false);
    } finally {
      setAbandoning(false);
    }
  };

  return (
    <Card className="relative overflow-hidden">
      {/* Accent bar top */}
      <div
        className={`absolute inset-x-0 top-0 h-1 ${
          isAchieved
            ? "bg-success"
            : status === "on-track"
              ? "bg-goal-on-track"
              : status === "behind"
                ? "bg-goal-behind"
                : "bg-goal-at-risk"
        }`}
      />

      <div className="flex items-start gap-4 pt-2">
        {/* Type icon */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-title1">
          {GoalIcon && <GoalIcon className="h-6 w-6" aria-hidden />}
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-headline font-semibold text-text-primary">
              {displayGoal.title}
            </h2>
            {!isAchieved && (
              <Badge variant={statusVariant(status)}>
                {statusLabel(status)}
              </Badge>
            )}
            {isAchieved && <Badge variant="success">已达成</Badge>}
          </div>

          {displayGoal.type === "event" && displayGoal.race_distance_m && (
            <p className="mt-1 text-caption1 text-text-muted">
              比赛距离 {(displayGoal.race_distance_m / 1000).toFixed(2)} 公里
              {displayGoal.race_target_time_s
                ? ` · 目标完赛用时 ${Math.floor(displayGoal.race_target_time_s / 3600)}:${String(Math.floor(displayGoal.race_target_time_s / 60) % 60).padStart(2, "0")}`
                : ""}
            </p>
          )}
          <div className="mt-1 flex items-baseline gap-2 text-subheadline">
            <span className="font-mono tabular-nums text-text-primary">
              {displayGoal.current_value.toFixed(1)}
            </span>
            <span className="text-text-muted">/</span>
            <span className="font-mono tabular-nums text-text-secondary">
              {displayGoal.target_value?.toFixed(1) ?? "--"}
            </span>
            {displayGoal.unit && (
              <span className="text-text-muted">{displayGoal.unit}</span>
            )}
          </div>
        </div>

        {/* Days remaining */}
        {days !== null && !isAchieved && (
          <div className="shrink-0 text-right">
            <div className="font-mono tabular-nums text-title1 font-bold text-text-primary">
              {days}
            </div>
            <div className="text-caption1 text-text-muted">天剩余</div>
          </div>
        )}
      </div>

      {/* Progress bar — auto-tracked */}
      <div className="mt-4">
        <Progress
          value={progress}
          max={100}
          label="自动追踪"
          showValue
          size="lg"
          barClass={
            isAchieved
              ? "bg-success"
              : status === "at-risk"
                ? "bg-goal-at-risk"
                : status === "behind"
                  ? "bg-goal-behind"
                  : "bg-goal-on-track"
          }
        />
        <p className="mt-1.5 text-caption1 text-text-muted">
          自动更新于 {lastUpdated}
        </p>
      </div>

      {/* Actions */}
      {!isAchieved && displayGoal.status === "active" && (
        <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-4">
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={refreshLoading}
          >
            {refreshLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <RefreshSpinner />
                刷新中…
              </span>
            ) : (
              "刷新进度"
            )}
          </Button>
          <Button variant="secondary" onClick={() => onEdit(displayGoal)}>
            编辑
          </Button>
          <Button
            variant="secondary"
            onClick={() => onAchieve(displayGoal)}
            className="border-success/30 text-success hover:bg-success/10"
          >
            标记达成
          </Button>
          <Button
            variant="ghost"
            onClick={requestAbandon}
            aria-haspopup="dialog"
            data-testid="abandon-goal-trigger"
            className="ml-auto text-text-muted hover:text-error"
          >
            放弃
          </Button>
        </div>
      )}

      {/* Refresh error inline */}
      {refreshError && (
        <p className="mt-2 text-caption1 text-error">{refreshError}</p>
      )}

      <Dialog open={abandonOpen} onOpenChange={(next) => {
        if (abandoning) return;
        setAbandonOpen(next);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>放弃这个目标？</DialogTitle>
          </DialogHeader>
          <p className="text-subheadline text-text-secondary">
            目标 “{displayGoal.title}” 将被删除，历史进度与里程碑也会一并清除。此操作不可撤销。
          </p>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={cancelAbandon}
              disabled={abandoning}
              data-testid="abandon-goal-cancel"
            >
              保留目标
            </Button>
            <Button
              type="button"
              onClick={() => void confirmAbandon()}
              disabled={abandoning}
              data-testid="abandon-goal-confirm"
              className="bg-error text-text-inverse hover:bg-error/90"
            >
              {abandoning ? "正在放弃…" : "确认放弃"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
