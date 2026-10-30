export type SegmentType = "Warmup" | "SteadyState" | "IntervalsT" | "Cooldown";

export interface WorkoutSegment {
  id: string;
  segment_type: SegmentType;
  duration_s: number;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  repetitions?: number | null;
}

export interface CalendarEventDTO {
  event_id: string;
  start_time: string;
  category: string;
  sport_type?: string;
  name?: string;
  workout_xml?: string;
  predicted_tss?: number | null;
  /** 计划距离（米）：课表生成时由步骤与配速算出。 */
  readonly predicted_distance_m?: number | null;
  status?: string;
  done?: boolean;
  training_type?: string | null;
  readonly external_id?: string | null;
  workout_prescription?: {
    type: string;
    duration_min: number;
    pace_min_s_km?: number | null;
    pace_max_s_km?: number | null;
    heart_rate_max_bpm?: number | null;
    segments: {
      type: string;
      duration_min: number;
      pace_min_s_km?: number | null;
      pace_max_s_km?: number | null;
      repetitions?: number;
      recovery_min?: number;
      rpe_min?: number;
      rpe_max?: number;
      heart_rate_max_bpm?: number | null;
    }[];
    phase?: string;
  } | null;
  athlete_edited?: boolean;
  readonly linked_activity_id?: string | null;
  completed_distance_m?: number | null;
  completed_duration_s?: number | null;
  completed_avg_hr?: number | null;
  completed_rpe?: number | null;
  actual_logged_at?: string | null;
}

export const totalDurationMinutes = (segments: WorkoutSegment[]): number =>
  Math.round(segments.reduce((total, segment) => total + segment.duration_s, 0) / 60);

export const SEGMENT_TYPES: SegmentType[] = [
  "Warmup",
  "SteadyState",
  "IntervalsT",
  "Cooldown",
];

export const SEGMENT_TYPE_LABEL: Record<SegmentType, string> = {
  Warmup: "热身",
  SteadyState: "稳态",
  IntervalsT: "间歇",
  Cooldown: "放松",
};

/** Training goal category (Chinese labels in UI) */
export type TrainingGoal =
  | "recovery"
  | "aerobic-base"
  | "tempo"
  | "threshold"
  | "vo2max"
  | "long-run";

export const TRAINING_GOALS: { value: TrainingGoal; label: string }[] = [
  { value: "recovery", label: "恢复" },
  { value: "aerobic-base", label: "有氧基础" },
  { value: "tempo", label: "节奏" },
  { value: "threshold", label: "阈值训练" },
  { value: "vo2max", label: "VO₂max" },
  { value: "long-run", label: "长距离" },
];

/** Calendar event category — determines visual treatment. */
export type CalendarEventCategory = "activity" | "workout";

interface CategoryVisual {
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  iconBgClass: string;
}

export const CATEGORY_VISUAL: Record<CalendarEventCategory, CategoryVisual> = {
  activity: {
    label: "已完成",
    colorClass: "text-success",
    bgClass: "bg-success/10",
    borderClass: "border-success/40",
    iconBgClass: "bg-success/15",
  },
  workout: {
    label: "计划中",
    colorClass: "text-accent-strong",
    bgClass: "bg-accent/10",
    borderClass: "border-accent/40",
    iconBgClass: "bg-accent/15",
  },
};

/** 将接口事件类别映射到日历中的训练或活动。 */
export function displayCategory(category: string): CalendarEventCategory {
  if (category === "activity" || category === "workout") {
    return category;
  }
  return "workout";
}
