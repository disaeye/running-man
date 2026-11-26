"use client";

import { ActivitySummaryRow } from "@features/activity/components/ActivitySummaryRow";
import {
  useSessionClassifications,
  type SessionClassificationItem,
} from "@features/activity/hooks/useSessionClassifications";
import { activityDetailUrl } from "@shared/config/training-nav";
import type { ActivitySummary } from "@shared/types/activity";

export interface SessionCardProps {
  readonly activity: ActivitySummary;
  readonly classification?: SessionClassificationItem | null;
  readonly returnTo: string;
  readonly onClick?: () => void;
  /** Render the GPS route as a faint background texture (needs summary_polyline). */
  readonly showRoute?: boolean;
}

export function SessionCard({
  activity,
  classification,
  returnTo,
  onClick,
  showRoute = false,
}: SessionCardProps) {
  const { byActivityId } = useSessionClassifications(undefined, undefined, classification === undefined);
  const stored = classification !== undefined ? classification : byActivityId.get(activity.activity_id);

  return (
    <div data-testid="session-card" className="rounded-2xl border border-border-subtle bg-surface-card">
      <ActivitySummaryRow
        activity={activity}
        classification={stored}
        href={activityDetailUrl(activity.activity_id, returnTo)}
        onClick={onClick}
        showRoute={showRoute}
      />
    </div>
  );
}
