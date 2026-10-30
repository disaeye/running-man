import { apiErrorMessage } from "@shared/lib/api";
import { AlertTriangle } from "lucide-react";
import type { Goal, Milestone } from "@shared/types/goals";
import type { MilestoneDraft } from "@features/goals/hooks/useGoals";
import { GoalCard } from "@features/goals/components/GoalCard";
import { MilestoneList } from "@features/goals/components/MilestoneList";
import { PhaseTimeline } from "@features/goals/components/PhaseTimeline";
import { RaceReadinessCard } from "@features/goals/components/RaceReadinessCard";

/** The selected-goal detail block: GoalCard + readiness + grid (progress +
 *  phase timeline) + milestone list with loading/error fallbacks.
 *  Extracted verbatim from goals/page.tsx (former L118-145). */
export function GoalDetail({
  goal,
  milestones,
  milestoneLoading,
  goalError,
  onEdit,
  onAbandon,
  onAchieve,
  onToggleMilestone,
  onSaveMilestone,
}: {
  goal: Goal | null;
  milestones: Milestone[];
  milestoneLoading: boolean;
  goalError: string | null;
  onEdit: (goal: Goal) => void;
  onAbandon: (goal: Goal) => Promise<void>;
  onAchieve: (goal: Goal) => Promise<void>;
  onToggleMilestone: (milestoneId: string) => Promise<void>;
  onSaveMilestone: (milestoneId: string | null, draft: MilestoneDraft) => Promise<void>;
}) {
  if (!goal) return null;

  return (
    <>
      <GoalCard
        goal={goal}
        onEdit={onEdit}
        onAbandon={onAbandon}
        onAchieve={onAchieve}
      />

      <RaceReadinessCard goal={goal} />

      {goal.target_date ? (
        <div className="min-w-0">
          <PhaseTimeline goal={goal} />
        </div>
      ) : null}
      {milestoneLoading ? (
        <div className="h-32 w-full animate-pulse rounded-lg bg-surface-raised" />
      ) : goalError ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4 text-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-subheadline font-medium">读取目标资料失败</p>
            <p className="mt-1 text-caption1">{apiErrorMessage(goalError)}</p>
          </div>
        </div>
      ) : (
        <MilestoneList
          milestones={milestones}
          onToggle={onToggleMilestone}
          onSave={onSaveMilestone}
          goalUnit={goal.unit}
        />
      )}
    </>
  );
}
