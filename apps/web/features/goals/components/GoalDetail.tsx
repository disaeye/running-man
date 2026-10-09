import { apiErrorMessage } from "@shared/lib/api";
import type { Goal, Milestone } from "@shared/types/goals";
import { GoalCard } from "@features/goals/components/GoalCard";
import { MilestoneList } from "@features/goals/components/MilestoneList";
import { PhaseTimeline } from "@features/goals/components/PhaseTimeline";
import { GoalProgress } from "@features/goals/components/GoalProgress";
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
}: {
  goal: Goal | null;
  milestones: Milestone[];
  milestoneLoading: boolean;
  goalError: string | null;
  onEdit: (goal: Goal) => void;
  onAbandon: (goal: Goal) => Promise<void>;
  onAchieve: (goal: Goal) => Promise<void>;
  onToggleMilestone: (milestoneId: string) => Promise<void>;
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

      {goal.status === "achieved" ? (
        <div className="min-w-0">
          <PhaseTimeline goal={goal} />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="min-w-0">
            <GoalProgress goal={goal} />
          </div>
          <div className="min-w-0">
            <PhaseTimeline goal={goal} />
          </div>
        </div>
      )}

      {goalError ? (
        <p className="text-subheadline text-error">
          {apiErrorMessage(goalError)}
        </p>
      ) : milestoneLoading ? (
        <div className="h-32 w-full animate-pulse rounded-lg bg-surface-raised" />
      ) : (
        <MilestoneList
          milestones={milestones}
          onToggle={onToggleMilestone}
          goalUnit={goal.unit}
        />
      )}
    </>
  );
}
