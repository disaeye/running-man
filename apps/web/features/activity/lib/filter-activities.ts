import type { ActivitySummary } from "@shared/types/activity";
import {
  getSportConfig,
  sportFamilyLabel,
  type SportFamily,
} from "@shared/config/sport-config";
import type { ActivityFilterState } from "@features/activity/components/ActivityFilters";
import { classifySession } from "@features/activity/lib/session-classification";

/** Running and strength project filter used by the training log. */
export type ProjectFilter = "all" | "run" | "strength";

const PROJECT_FAMILY: Readonly<Record<Exclude<ProjectFilter, "all" | "strength">, SportFamily>> = {
  run: "running",
};

/** Chip definitions for the project filter, single-sourced here. */
export const PROJECT_FILTERS: readonly { value: ProjectFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "run", label: sportFamilyLabel("running") },
  // The strength family holds 健身 and 力量训练; the chip names the bucket
  // after the training it represents rather than after one of its two sports.
  { value: "strength", label: getSportConfig("WeightTraining").label },
];

/** Sport → project bucket. `all` matches everything; unknown sports match nothing. */
export function matchesProject(sport: string, project: ProjectFilter): boolean {
  if (project === "all") return !["Ride", "VirtualRide", "Bike"].includes(sport);
  const cfg = getSportConfig(sport);
  if (project === "strength") return cfg.isStrength;
  return cfg.family === PROJECT_FAMILY[project];
}

/**
 * Pure filter pipeline for activities. Mirrors the conditions the ActivitiesPage
 * and CalendarListView apply to their `useActivities` data: project, sport,
 * intensity, gpsOnly, and source. Returns a new array; does not mutate input.
 */
export function filterActivities(
  data: ActivitySummary[],
  filters: ActivityFilterState,
  project: ProjectFilter = "all",
): ActivitySummary[] {
  let result = data;

  if (project !== "all") {
    result = result.filter((a) => matchesProject(a.sport, project));
  }
  if (filters.sport !== "all") {
    result = result.filter((a) => a.sport === filters.sport);
  }
  if (filters.race && filters.race !== "all") {
    result = result.filter((activity) => Boolean(activity.is_race) === (filters.race === "race"));
  }
  if (filters.intensity !== "all") {
    result = result.filter((activity) => classifySession(activity).effort === filters.intensity);
  }
  if (filters.gpsOnly) {
    // Filter on whether the activity actually has GPS.
    //
    // This previously tested ``source === "garmin"``, a source value that never
    // occurs — this deployment syncs from Intervals.icu, and the registry lists
    // fit / gpx / tcx / manual / intervals_icu. The filter therefore
    // always returned an empty list and the UI reported "no matching
    // activities" for a query that could never match anything.
    result = result.filter((a) => a.has_gps === true);
  }
  if (filters.source !== "all") {
    result = result.filter((a) => a.source === filters.source);
  }

  return result;
}
