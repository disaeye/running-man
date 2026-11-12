"use client";

import { Sparkles, Pencil, Archive } from "lucide-react";
import { Trophy } from "lucide-react";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { RaceResultEntry } from "@features/goals/components/RaceResultEntry";
import { GoalHeroSummary } from "@features/goals/components/GoalHeroSummary";
import { GoalPhases } from "@features/goals/components/GoalPhases";
import { GoalProgress } from "@features/goals/components/GoalProgress";
import { RaceReadinessCard } from "@features/goals/components/RaceReadinessCard";
import { TrainingPaceCard } from "@features/goals/components/TrainingPaceCard";
import { GoalsPageSkeleton } from "@features/goals/components/GoalsPageSkeleton";
import { MilestoneList } from "@features/goals/components/MilestoneList";
import { PersonalRecordsHall } from "@features/goals/components/PersonalRecordsHall";
import { GoalLoadForecast } from "@features/goals/components/GoalLoadForecast";
import { GoalAdjustments } from "@features/goals/components/GoalAdjustments";
import { useGoal, createMilestone, toggleMilestone, updateMilestone } from "@features/goals/hooks/useGoals";
import { useGoalRefresh } from "@features/goals/hooks/useGoalRefresh";
import { usePlanAdjustments } from "@features/goals/hooks/usePlanAdjustments";
import { useAthleteTimezone, athleteToday } from "@shared/lib/training-day";
import { GOAL_TYPES, type Goal } from "@shared/types/goals";

/** 目标详情区：按类型分叉渲染。比赛走阶段与配速，其他类型走进度环。 */
export function GoalDetailArea({ goalId, onEdit, onAbandon, onGenerate }: {
  goalId: string;
  onEdit: () => void;
  onAbandon: () => void;
  onGenerate: () => void;
}) {
  const { goal, milestones, refresh, loading } = useGoal(goalId);
  const timezone = useAthleteTimezone();
  const adjustments = usePlanAdjustments();
  const { refreshGoal, loading: refreshLoading, error: refreshError } = useGoalRefresh();
  const today = athleteToday(timezone);
  const days = goal?.target_date
    ? Math.max(0, Math.ceil((new Date(goal.target_date).getTime() - new Date(today).getTime()) / 86400000))
    : null;

  if (loading && !goal) return <GoalsPageSkeleton />;
  if (!goal) return null;

  const isEvent = goal.type === "event";
  const canGenerate = isEvent && goal.status === "active" && goal.target_date != null && goal.race_distance_m != null;
  const racePassed = isEvent && goal.status === "active" && goal.target_date != null && goal.target_date < today;

  return (
    <div className="space-y-4">
      {isEvent ? (
        <PageCard hero>
          <GoalHeroSummary goal={goal} days={days} />
          <DetailActions
            onEdit={onEdit}
            onAbandon={onAbandon}
            onGenerate={canGenerate ? onGenerate : undefined}
            onRecordResult={racePassed ? () => void refresh() : undefined}
            goalForResult={racePassed ? goal : null}
          />
        </PageCard>
      ) : (
        <PageCard hero>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow">训练目标 · {(GOAL_TYPES[goal.type] ?? GOAL_TYPES.event).label}</div>
              <h2 className="num mt-1 text-3xl font-bold">{goal.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {goal.target_date ? `目标日期 ${goal.target_date}` : "未设置目标日期"}
                {goal.start_date ? ` · 起算 ${goal.start_date}` : ""}
              </p>
            </div>
            {goal.is_primary ? <Tag tone="primary">主目标</Tag> : null}
          </div>
          <DetailActions onEdit={onEdit} onAbandon={onAbandon} />
        </PageCard>
      )}

      {isEvent ? (
        <>
          {goal.target_date ? <GoalPhases goalId={goalId} today={today} /> : null}
          <RaceReadinessCard goal={goal} />
          <TrainingPaceCard goalId={goalId} />
        </>
      ) : (
        <GoalProgress
          goal={goal}
          onRefresh={() => void refreshGoal(goalId).then(refresh)}
          refreshLoading={refreshLoading}
          refreshError={refreshError}
        />
      )}

      <PageCard title="里程碑">
        <MilestoneList
          milestones={milestones}
          goalId={goalId}
          goalUnit={goal.unit}
          onToggle={async (id) => {
            await toggleMilestone(goalId, id, !milestones.find((m) => m.milestone_id === id)?.achieved);
            await refresh();
          }}
          onSave={async (id, draft) => {
            if (id) await updateMilestone(goalId, id, draft);
            else await createMilestone(goalId, draft);
            await refresh();
          }}
        />
      </PageCard>

      <GoalLoadForecast today={today} targetDate={goal.target_date} timezone={timezone} />
      <GoalAdjustments adjustments={adjustments.data} onDecided={adjustments.reload} />
      <PageCard title="个人荣誉室" action={<Trophy className="h-4 w-4 text-warn" aria-hidden />}>
        <PersonalRecordsHall />
      </PageCard>
    </div>
  );
}

export function DetailActions({ onEdit, onAbandon, onGenerate, onRecordResult, goalForResult }: {
  onEdit: () => void;
  onAbandon: () => void;
  onGenerate?: () => void;
  onRecordResult?: () => void;
  goalForResult?: Goal | null;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle pt-3">
      {onGenerate ? (
        <button type="button" onClick={onGenerate} className="tactile inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border-default px-3.5 text-caption1 font-medium text-text-primary hover:bg-secondary">
          <Sparkles className="h-3.5 w-3.5 text-accent-strong" aria-hidden />
          生成 / 调整训练计划
        </button>
      ) : null}
      {onRecordResult && goalForResult ? (
        <RaceResultEntry goal={goalForResult} onRecorded={onRecordResult} />
      ) : null}
      <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-1.5 text-caption1 text-accent-strong hover:underline">
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        编辑目标
      </button>
      <button type="button" onClick={onAbandon} className="inline-flex min-h-11 items-center gap-1.5 text-caption1 text-text-muted hover:text-error">
        <Archive className="h-3.5 w-3.5" aria-hidden />
        放弃目标
      </button>
    </div>
  );
}
