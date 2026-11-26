import { getSportConfig } from "@shared/config/sport-config";
import { formatDistance } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";
import type { SessionClassificationItem } from "@features/activity/hooks/useSessionClassifications";

export function activityDisplayName(
  activity: ActivitySummary,
  classification?: SessionClassificationItem | null,
): string {
  const classificationName = classification?.session_classification.display_name;
  if (classificationName && !["未分类", "结构待确认", "刺激待确认"].includes(classificationName)) {
    return classificationName;
  }
  const original = activity.name?.trim() ?? "";
  if (original && !/^(morning|lunch|afternoon|evening|night)\b/i.test(original)) return original;
  const sportLabel = getSportConfig(activity.sport).label;
  return activity.distance_m != null
    ? `${sportLabel} · ${formatDistance(activity.distance_m)}`
    : sportLabel;
}

export function activityOriginalName(activity: ActivitySummary): string | null {
  const original = activity.name?.trim();
  return original || null;
}
