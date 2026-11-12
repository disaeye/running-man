/**
 * Effort bucket derived from an ActivitySummary. Session type labels come from
 * the backend five-object classification, so this module never invents a
 * Chinese training-type name. It only supports the intensity filter and the
 * effort strip while a stored classification is unavailable.
 */
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";

export type SessionEffort = "easy" | "moderate" | "hard" | "unknown";

export interface SessionClassification {
  readonly label: string;
  readonly effort: SessionEffort;
  readonly kind: string;
}

const RUN_SPORTS: ReadonlySet<string> = new Set(["Run", "VirtualRun", "TrailRun"]);
const HIGH_INTENSITY_IF = 0.85;
const HIGH_HR_RATIO = 0.9;
const LOW_HR_RATIO = 0.75;

function isHighIntensity(
  intensity_factor: number | null,
  avg_hr: number | null,
  max_hr: number | null,
): boolean {
  if (intensity_factor != null && intensity_factor >= HIGH_INTENSITY_IF) return true;
  return avg_hr != null && max_hr != null && max_hr > 0 && avg_hr > max_hr * HIGH_HR_RATIO;
}

function isThreshold(intensity_factor: number | null): boolean {
  return intensity_factor != null
    && intensity_factor >= LOW_HR_RATIO
    && intensity_factor <= HIGH_INTENSITY_IF;
}

function isEasy(avg_hr: number | null, max_hr: number | null): boolean {
  return avg_hr != null && max_hr != null && max_hr > 0 && avg_hr < max_hr * LOW_HR_RATIO;
}

function classifyRun(activity: ActivitySummary): SessionClassification {
  const label = getSportConfig(activity.sport).label;
  if (isHighIntensity(activity.intensity_factor, activity.avg_hr, activity.max_hr)) {
    return { label, effort: "hard", kind: "hard_effort" };
  }
  if (isThreshold(activity.intensity_factor)) {
    return { label, effort: "moderate", kind: "moderate_effort" };
  }
  if (isEasy(activity.avg_hr, activity.max_hr)) {
    return { label, effort: "easy", kind: "easy_effort" };
  }
  return { label, effort: "unknown", kind: "unknown_effort" };
}

/** Effort bucket and sport label; never a cross-dimension training type. */
export function classifySession(activity: ActivitySummary): SessionClassification {
  if (!RUN_SPORTS.has(activity.sport)) {
    const label = getSportConfig(activity.sport).label;
    return {
      label,
      effort: activity.avg_hr == null ? "unknown" : "moderate",
      kind: activity.sport.toLowerCase(),
    };
  }
  return classifyRun(activity);
}
