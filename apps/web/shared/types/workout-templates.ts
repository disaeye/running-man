/** Segment within a workout template (mirrors Python WorkoutTemplateSegment). */
export interface WorkoutTemplateTarget {
  distance_m?: number | null;
  duration_s?: number | null;
  pace_key?: string | null;
  anchor_model?: string | null;
  domain?: string | null;
}

export interface WorkoutTemplateSegment {
  segment_type: string;
  duration_s: number;
  distance_m?: number | null;
  pace_key?: string | null;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  repetitions?: number | null;
  recovery_s?: number | null;
  recovery_distance_m?: number | null;
  role?: string | null;
  sets?: number | null;
  target_domain?: string | null;
  anchor?: string | null;
  primary_stimulus?: string | null;
  source_refs?: string[];
  rationale?: string | null;
  target_adaptation?: string | null;
  target?: WorkoutTemplateTarget | null;
  measured?: Record<string, unknown> | null;
  evidence?: {
    source_refs?: string[];
    measurement_sources?: string[];
    limitations?: string[];
    rationale?: string | null;
  } | null;
  quality_target?: {
    work_distance_m?: number | null;
    work_duration_s?: number | null;
    time_in_domain_s?: number | null;
    target_repetitions?: number | null;
  } | null;
}

/** Full workout template response from the API. */
export interface WorkoutTemplate {
  template_id: string;
  athlete_id: string | null;
  name: string;
  sport: string;
  goal_type: string | null;
  segments: WorkoutTemplateSegment[] | null;
  predicted_tss: number | null;
  source: "builtin" | "user";
  created_at: string;
}

export interface WorkoutTemplateCreate {
  name: string;
  sport?: string;
  goal_type?: string | null;
  segments: WorkoutTemplateSegment[];
  predicted_tss?: number | null;
}

export interface WorkoutTemplateUpdate {
  name?: string;
  sport?: string;
  goal_type?: string | null;
  segments?: WorkoutTemplateSegment[] | null;
  predicted_tss?: number | null;
}

import { getSportConfig } from "@shared/config/sport-config";

export const SPORT_OPTIONS: { value: string; label: string }[] = [
  { value: "Run", label: getSportConfig("Run").label },
];
