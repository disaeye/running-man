import { apiErrorMessage } from "@shared/lib/api";
import type { Goal } from "@shared/types/goals";

/** Inline error banners shown above the goal list.
 *  Extracted verbatim from goals/page.tsx (former L82-92). */
export function GoalsErrorBanner({
  error,
  goalError,
  effectiveGoalId,
  currentGoal,
}: {
  error: string | null;
  goalError: string | null;
  effectiveGoalId: string | null;
  currentGoal: Goal | null;
}) {
  return (
    <>
      {error && (
        <div className="rounded-md border border-error/30 bg-error/5 px-4 py-3 text-subheadline text-error">
          {apiErrorMessage(error)}
        </div>
      )}

      {effectiveGoalId && goalError && !currentGoal && (
        <div className="rounded-md border border-error/30 bg-error/5 px-4 py-3 text-subheadline text-error">
          {apiErrorMessage(goalError)}
        </div>
      )}
    </>
  );
}
