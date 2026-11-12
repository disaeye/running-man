export interface Goal {
  goal_id: string;
  athlete_id: string;
  type: GoalType;
  title: string;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  /** 累计起算日（ISO 日期）；缺省时后端回填创建日。 */
  start_date: string | null;
  /** 目标运动类别（sport_definitions 的键）。 */
  sport_key: string | null;
  /** 主比赛目标标记：同时最多一条 active。 */
  is_primary: boolean;
  /** 体重目标的基线值。 */
  baseline_value: number | null;
  /** increase 向上累计；decrease 向下趋近（体重）。 */
  direction: GoalDirection;
  target_date: string | null;
  race_distance_m: number | null;
  race_target_time_s: number | null;
  /** 比赛结案后的实际完赛用时。 */
  race_actual_time_s: number | null;
  /** 比赛结案时关联的活动。 */
  race_activity_id: string | null;
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

export type GoalDirection = "increase" | "decrease";

export type GoalStatus = "active" | "achieved" | "abandoned";

export interface Milestone {
  milestone_id: string;
  goal_id: string;
  /** 可选绑定的训练阶段：阶段结束后按累计跑量自动核验。 */
  phase_id: string | null;
  title: string;
  target_date: string | null;
  target_value: number | null;
  unit: string | null;
  result_text: string | null;
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
