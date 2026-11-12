export type SegmentType = "Warmup" | "SteadyState" | "IntervalsT" | "Cooldown";

export interface WorkoutSegment {
  id: string;
  segment_type: SegmentType;
  duration_s: number;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  repetitions?: number | null;
}

export type SessionSegmentRole =
  | "warmup"
  | "work"
  | "recovery"
  | "cooldown"
  | "transition";

export interface SessionTargetDTO {
  distance_m?: number | null;
  duration_s?: number | null;
  pace_s_km?: number | null;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  hr_bpm?: number | null;
  domain?: string | null;
}

export interface SessionMeasuredDTO {
  distance_m?: number | null;
  duration_s?: number | null;
  pace_s_km?: number | null;
  avg_hr?: number | null;
  speed_m_s?: number | null;
  rpe?: number | null;
}

export interface SessionSegmentDTO {
  type: string;
  duration_min: number;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  repetitions?: number | null;
  recovery_min?: number | null;
  rpe_min?: number | null;
  rpe_max?: number | null;
  role?: string | null;
  order?: number | null;
  start_s?: number | null;
  end_s?: number | null;
  duration_s?: number | null;
  distance_m?: number | null;
  pace_s_km?: number | null;
  avg_hr?: number | null;
  domain?: string | null;
  evidence_source?: string | null;
  source_group?: string | null;
  sets?: number | null;
  recovery_duration_s?: number | null;
  recovery_distance_m?: number | null;
  intensity_domain?: string | null;
  target_domain?: string | null;
  source_refs?: string[];
  rationale?: string | null;
  target_adaptation?: string | null;
  quality_target?: {
    work_distance_m?: number | null;
    work_duration_s?: number | null;
    time_in_domain_s?: number | null;
    target_repetitions?: number | null;
  } | null;
  target?: SessionTargetDTO | null;
  measured?: SessionMeasuredDTO | null;
  evidence?: {
    source_refs?: string[];
    measurement_sources?: string[];
    limitations?: string[];
    rationale?: string | null;
  } | null;
}

export interface WorkoutPrescriptionDTO {
  type: string;
  duration_min: number;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  segments: SessionSegmentDTO[];
  phase?: string | null;
  structure?: string | null;
  session_type?: string | null;
  primary_stimulus?: string | null;
  pacing_pattern?: string | null;
  display_line?: string | null;
  target_domain?: string | null;
  source_refs?: string[];
  rationale?: string | null;
  target_adaptation?: string | null;
  quality_target?: {
    work_distance_m?: number | null;
    work_duration_s?: number | null;
    time_in_domain_s?: number | null;
    target_repetitions?: number | null;
  } | null;
  evidence?: {
    source_refs?: string[];
    measurement_sources?: string[];
    limitations?: string[];
    rationale?: string | null;
    interval_summary?: string[] | null;
  } | null;
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
  workout_prescription?: WorkoutPrescriptionDTO | null;
  athlete_edited?: boolean;
  readonly linked_activity_id?: string | null;
  completed_distance_m?: number | null;
  completed_duration_s?: number | null;
  completed_avg_hr?: number | null;
  completed_rpe?: number | null;
  actual_logged_at?: string | null;
  execution?: {
    activity_distance_m?: number | null;
    work_distance_m?: number | null;
    recovery_distance_m?: number | null;
    segments?: SessionSegmentDTO[];
    work_groups?: {
      source_group: string;
      sets: number;
      repetitions?: number | null;
      distance_range_m?: number[];
      duration_range_s?: number[];
      pace_range_s_km?: number[];
    }[];
  } | null;
  quality?: {
    work_distance_match?: number | null;
    work_duration_match?: number | null;
    pace_attainment?: number | null;
    structure_match?: number | null;
    evidence_grade?: string | null;
    confidence?: number | null;
  } | null;
  session_classification?: {
    session_classification: {
      activity_id: string;
      local_day: string;
      context: string;
      structure: string;
      session_type?: string | null;
      primary_stimulus: string;
      secondary_stimuli?: string[];
      pacing_pattern?: string | null;
      modifiers?: string[];
      display_name: string;
      display_line: string;
      evidence_grade: string;
      confidence: number;
    };
    prescription?: WorkoutPrescriptionDTO | null;
    execution?: {
      activity_distance_m?: number | null;
      work_distance_m?: number | null;
      segments?: SessionSegmentDTO[];
    } | null;
    quality?: {
      repetition_match?: number | null;
      work_distance_match?: number | null;
      work_duration_match?: number | null;
      structure_match?: number | null;
      evidence_grade?: string | null;
    } | null;
    evidence?: {
      source_refs?: string[];
      threshold_snapshot?: Record<string, unknown> | null;
      limitations?: string[];
    } | null;
  } | null;
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
