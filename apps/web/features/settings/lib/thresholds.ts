import type { UserProfile } from "@shared/lib/auth";

/**
 * The four numbers every zone boundary is derived from.
 *
 * One list, used by the settings header and by the Today page's setup card, so
 * a surface cannot claim the baseline is missing while another shows it filled
 * in.
 */
export const THRESHOLD_FIELDS = ["hr_max", "resting_hr", "lthr", "threshold_pace"] as const;

export function countRecordedThresholds(profile: UserProfile | null): number {
  return THRESHOLD_FIELDS.filter((field) => profile?.[field] != null).length;
}
