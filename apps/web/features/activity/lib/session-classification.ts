/**
 * Pure classification of an `ActivitySummary` into a Chinese training-type label
 * (e.g. 轻松跑, 节奏跑, 高强度跑, 长跑) plus an effort bucket. No API calls, no
 * React, no mutation — feeds the SessionCard in the IA-redesign worktree.
 *
 * Running labels use session duration, distance, heart-rate ratio, and intensity factor.
 */
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";

export type SessionEffort = "easy" | "moderate" | "hard" | "unknown";

export interface SessionClassification {
  readonly label: string;
  readonly effort: SessionEffort;
  /** Stable slug for downstream keys/analytics; never localized. */
  readonly kind: string;
}

const RUN_SPORTS: ReadonlySet<string> = new Set(["Run", "VirtualRun", "TrailRun"]);

/** Threshold constants — single source so the spec stays auditable. */
const LONG_RUN_DURATION_S = 5400; // 90 min
const LONG_RUN_DISTANCE_M = 15000; // 15 km
const HIGH_INTENSITY_IF = 0.85;
const HIGH_HR_RATIO = 0.9;
const LOW_HR_RATIO = 0.75;

/** Effort → Chinese display label for run-family sessions. */
const RUN_LABELS: Readonly<Record<SessionEffort, string>> = {
  easy: "轻松跑",
  moderate: "节奏跑",
  hard: "高强度跑",
  unknown: "跑步",
};

/** Run-family `kind` slugs (stable, not localized). */
const RUN_KINDS: Readonly<Record<SessionEffort, string>> = {
  easy: "easy_run",
  moderate: "tempo_run",
  hard: "high_intensity_run",
  unknown: "run",
};

function isLongRun(distance_m: number | null, duration_s: number | null): boolean {
  return (
    (duration_s != null && duration_s >= LONG_RUN_DURATION_S) ||
    (distance_m != null && distance_m >= LONG_RUN_DISTANCE_M)
  );
}

function isHighIntensity(
  intensity_factor: number | null,
  avg_hr: number | null,
  max_hr: number | null,
): boolean {
  if (intensity_factor != null && intensity_factor >= HIGH_INTENSITY_IF) return true;
  if (
    avg_hr != null &&
    max_hr != null &&
    max_hr > 0 &&
    avg_hr > max_hr * HIGH_HR_RATIO
  ) {
    return true;
  }
  return false;
}

function isThreshold(intensity_factor: number | null): boolean {
  return intensity_factor != null
    && intensity_factor >= LOW_HR_RATIO
    && intensity_factor <= HIGH_INTENSITY_IF;
}

function isEasy(
  avg_hr: number | null,
  max_hr: number | null,
): boolean {
  if (
    avg_hr != null &&
    max_hr != null &&
    max_hr > 0 &&
    avg_hr < max_hr * LOW_HR_RATIO
  ) {
    return true;
  }
  return false;
}

function classifyRun(activity: ActivitySummary): SessionClassification {
  const { intensity_factor, distance_m, duration_s, avg_hr, max_hr } = activity;

  if (isLongRun(distance_m, duration_s)) {
    return { label: "长跑", effort: "moderate", kind: "long_run" };
  }
  if (isHighIntensity(intensity_factor, avg_hr, max_hr)) {
    return { label: RUN_LABELS.hard, effort: "hard", kind: RUN_KINDS.hard };
  }
  if (isThreshold(intensity_factor)) {
    return { label: RUN_LABELS.moderate, effort: "moderate", kind: RUN_KINDS.moderate };
  }
  if (isEasy(avg_hr, max_hr)) {
    return { label: RUN_LABELS.easy, effort: "easy", kind: RUN_KINDS.easy };
  }
  return { label: RUN_LABELS.unknown, effort: "unknown", kind: RUN_KINDS.unknown };
}

function classifyOther(activity: ActivitySummary): SessionClassification {
  const { label } = getSportConfig(activity.sport);
  const effort = activity.avg_hr == null ? "unknown" : "moderate";
  return { label, effort, kind: activity.sport.toLowerCase() };
}

/** Classify an activity into a Chinese session label + effort bucket. */
export function classifySession(activity: ActivitySummary): SessionClassification {
  if (RUN_SPORTS.has(activity.sport)) {
    return classifyRun(activity);
  }
  return classifyOther(activity);
}
