"use client";

import { useState } from "react";
import { Flag, Flame, Ruler, Scale, Timer, type LucideIcon } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { Progress } from "@shared/ui/Progress";
import { NumberPair } from "@shared/ui/NumberPair";
import type { Goal } from "@shared/types/goals";
import { GOAL_TYPES } from "@shared/types/goals";
import { formatClock, formatRelativeTime } from "@shared/lib/format";
import { goalReading } from "@features/goals/lib/goal-value";
import { useGoalRefresh } from "@features/goals/hooks/useGoalRefresh";
import { GoalAbandonDialog } from "./GoalAbandonDialog";
import { GoalCardActions } from "./GoalCardActions";
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
  /**
   * 只读卡：整行操作（刷新/编辑/标记达成/放弃）不渲染。
   * 示例数据的 `goal_id` 在接口里不存在，入口出现在版面上就是一条死路。
   */
  readOnly?: boolean;
}

export function GoalCard({ goal, onEdit, onAbandon, onAchieve, readOnly = false }: GoalCardProps) {
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
  const currentReading = goalReading(displayGoal, displayGoal.current_value);
  const targetReading = goalReading(displayGoal, displayGoal.target_value);

  const handleRefresh = async () => {
    setRefreshError(null);
    try {
      const updated = await refreshGoal(displayGoal.goal_id);
      setLocalGoal(updated);
    } catch {
      setRefreshError("刷新失败，请稍后再试");
    }
  };

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
      {/* 顶部状态色条：编码目标健康度，不是装饰 */}
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

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 pt-2">
        {/* 类型图标 */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-title1">
          {GoalIcon && <GoalIcon className="h-6 w-6" aria-hidden />}
        </div>

        {/* 标题、比赛信息 */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
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
                ? ` · 目标完赛用时 ${formatClock(displayGoal.race_target_time_s)}`
                : ""}
            </p>
          )}
        </div>

        {/* 主数字：剩余天数 */}
        {days !== null && !isAchieved && (
          <div className="col-start-3 justify-self-end text-right">
            <div className="font-mono text-metric-lg font-semibold tabular-nums text-text-primary">
              {days}
            </div>
            <div className="text-caption1 text-text-muted">天剩余</div>
          </div>
        )}

        {/* 当前值与目标值：网格的直接子元素，窄屏占满整行，宽屏占第 2 列 */}
        <div className="col-span-3 col-start-1 row-start-2 sm:col-span-2 sm:col-start-2">
          <NumberPair
            left={{
              label: "当前",
              value: currentReading?.value ?? null,
              unit: currentReading?.unit,
            }}
            right={{
              label: "目标",
              value: targetReading?.value ?? null,
              unit: targetReading?.unit,
            }}
          />
        </div>
      </div>

      {/* 进度条：自动追踪 */}
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

      {!readOnly && !isAchieved && displayGoal.status === "active" && (
        <GoalCardActions
          refreshLoading={refreshLoading}
          refreshError={refreshError}
          onRefresh={() => void handleRefresh()}
          onEdit={() => onEdit(displayGoal)}
          onAchieve={() => onAchieve(displayGoal)}
          onAbandon={() => setAbandonOpen(true)}
        />
      )}

      <GoalAbandonDialog
        open={abandonOpen}
        goalTitle={displayGoal.title}
        abandoning={abandoning}
        onCancel={cancelAbandon}
        onConfirm={() => void confirmAbandon()}
      />
    </Card>
  );
}
