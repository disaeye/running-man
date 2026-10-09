/** Segment within a workout template (mirrors Python WorkoutTemplateSegment). */
export interface WorkoutTemplateSegment {
  segment_type: string;
  duration_s: number;
  power_low: number;
  power_high: number;
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
  { value: "Bike", label: getSportConfig("Bike").label },
];
