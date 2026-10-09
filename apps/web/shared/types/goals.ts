export interface Goal {
  goal_id: string;
  athlete_id: string;
  type: GoalType;
  title: string;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  target_date: string | null;
  race_distance_m: number | null;
  race_target_time_s: number | null;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

export type GoalType =
  | "event"
  | "distance"
  | "time"
  | "weight"
  | "consistency";

export type GoalStatus = "active" | "achieved" | "abandoned";

export interface Milestone {
  milestone_id: string;
  goal_id: string;
  title: string;
  target_date: string | null;
  target_value: number | null;
  achieved: boolean;
  achieved_at: string | null;
}

export interface TrainingPhase {
  phase_id: string;
  goal_id: string;
  name: PhaseName;
  start_date: string;
  end_date: string;
  target_weekly_tss: number | null;
}

export type PhaseName =
  | "base"
  | "build"
  | "peak"
  | "taper"
  | "recovery";

/** Goal type display metadata */
export interface GoalTypeConfig {
  label: string;
  icon: string;
  defaultUnit: string;
}

export const GOAL_TYPES: Record<GoalType, GoalTypeConfig> = {
  event: { label: "比赛", icon: "Flag", defaultUnit: "" },
  distance: { label: "距离", icon: "Ruler", defaultUnit: "km" },
  time: { label: "时间", icon: "Timer", defaultUnit: "min" },
  weight: { label: "体重", icon: "Scale", defaultUnit: "kg" },
  consistency: { label: "坚持", icon: "Flame", defaultUnit: "天" },
};

export type GoalStatus_ = "on-track" | "behind" | "at-risk";
