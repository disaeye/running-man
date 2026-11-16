export type JsonFixture = object | readonly object[] | null;

const COACH_CONTEXT = {
  data_freshness: {
    activities: { data_as_of: null, staleness_bucket: "missing" },
    wellness: { data_as_of: null, staleness_bucket: "missing" },
  },
  missing_data_caveats: [],
  plan_adherence: { adherence_pct: 0, completed_tss_7d: 0, planned_tss_7d: 0 },
  readiness: {
    data_sufficient: false, factors: [], level: "moderate", max_intensity: "low",
    readings: { hrv: null, resting_hr: null, sleep_secs: null },
    recommendation: "暂无足够数据", score: 50,
  },
  recent_load: {
    ctl_history_days: 0, ctl_warming_up: true, current_atl: 0, current_ctl: 0,
    current_tsb: 0, d28_tss: 0, d7_tss: 0, d90_tss: 0,
  },
  recommendation: {
    action: "rest", workout_type: "rest", duration_min: 0, target_tss: 0,
    intensity: "none", pace_targets: null, reason: "暂无足够数据", risks: [],
    next_workout: null,
  },
  recovery_signals: {
    hrv_trend_direction: "stable", readiness_score: 50,
    rhr_trend_direction: "stable", sleep_avg_7d: 0, tsb_recovery_days: null,
  },
};

const EMPTY_PLAN = {
  goal_id: null, goal_title: null, goal_type: null, target_date: null,
  race_distance_m: null, race_target_time_s: null, phases: [], current_phase: null,
  week_start: null, week_end: null, week_sessions: [], week_planned_tss: null,
  week_planned_distance_m: null, week_actual_tss: null, week_actual_distance_m: null,
  phase_week_number: null, phase_total_weeks: null, plan_progress_pct: null,
  vdot: null, training_paces: [], long_run_day: null,
};

export const DASHBOARD_FIXTURES: Readonly<Record<string, JsonFixture>> = {
  "/api/v1/notifications": [],
  "/api/v1/data/recompute-status": {
    status: "succeeded",
    requested_at: "2026-01-01T00:00:00Z",
    finished_at: "2026-01-01T00:00:08Z",
    attempts: 0,
    generation: 1,
    last_error: null,
    trigger: "manual",
  },
  "/api/v1/activities": [],
  "/api/v1/activities/ignored": [],
  "/api/v1/activities/stats": {
    activity_count: 0, avg_tss: 0, by_sport: [], total_distance_m: 0,
    total_duration_s: 0, total_tss: 0,
  },
  "/api/v1/activities/trash": [],
  "/api/v1/data/health": {
    activities: { data_as_of: null, total: 0, with_hr: 0, with_gps: 0, with_power: 0, with_streams: 0 },
    completeness: { activities: { with_hr: 0, with_gps: 0, with_power: 0 } },
    wellness: { data_as_of: null, total_days: 0, latest_day: null },
    training_load: { data_as_of: null },
    gaps: [],
  },
  "/api/v1/data/quality": {
    coverage: {
      activities: {
        first_at: null,
        total_activities: 0,
        unassigned_run_activities_30d: 0,
        with_gps: 0,
        with_hr: 0,
        with_power: 0,
        with_streams: 0,
      },
      strength: { sessions_14d: 0, sessions_total: 0 },
      sync: { last_sync_at: null, last_sync_status: null },
      uploads: { failed_30d: 0, runs_30d: 0 },
      wellness: { first_day: null, hrv_days_28d: 0, rhr_days_28d: 0, sleep_days_28d: 0 },
    },
    issues: [],
    summary: { issue_count: 0, last_checked_at: null, status: "ok" },
  },
  "/api/v1/athletes/me": {
    id: "00000000-0000-0000-0000-000000000001", email: "qa@example.com",
    name: "QA Runner", timezone: "UTC", preferred_sport: "Run",
    weekly_training_days: 5, max_session_duration_min: 120, hr_max: null,
    lthr: null, threshold_pace: null, resting_hr: null, dob: null, sex: null,
    height_cm: null, weight_goal: null,
  },
  "/api/v1/athletes/me/auto-calculate": {},
  "/api/v1/athletes/me/physiology": { computed_at: null },
  "/api/v1/athletes/me/thresholds": [],
  "/api/v1/calendar": [],
  "/api/v1/goals": [],
  "/api/v1/insights/ability": [],
  "/api/v1/insights/ability/current": {
    data_available: false, vdot: null, threshold_pace_s_per_km: null, trainingPaces: null,
  },
  "/api/v1/insights/athlete-grade": {
    configured: false, age_graded_pct: null, grade: null, reason: null,
  },
  "/api/v1/insights/coach-context": COACH_CONTEXT,
  "/api/v1/insights/intensity-distribution": { zones: [], summary: null },
  "/api/v1/insights/personal-range": {
    window_start: "2026-07-01", window_end: "2026-09-28", window_days: 90, figures: [],
  },
  "/api/v1/insights/personal-records": [],
  "/api/v1/insights/plan-quality": {
    grade: "C", score: 0, message: "暂无计划数据", weekly_tss: 0,
    target_tss: 0, key_sessions_completed: 0, key_sessions_total: 0,
    concerns: [], recommendations: [], strengths: [], risks: [],
  },
  "/api/v1/insights/readiness": {
    local_readiness: {
      score: 50, level: "moderate", recommendation: "暂无足够数据",
      max_intensity: "low", data_sufficient: false, factors: [],
      provenance: { factor_sources: {}, pmc_as_of: null, wellness_as_of: null },
      readings: { hrv: null, resting_hr: null, sleep_secs: null },
    },
    source_readiness: null,
  },
  "/api/v1/insights/weekly-progress": [],
  "/api/v1/insights/zones": {
    hr_max: null, hr_max_estimated: false, hr_scheme: "hrmax", hr_scheme_label: "",
    hr_zones: [], pace_zones: null, has_overrides: false, hr_schemes: [],
    unavailable_requirements: [], lthr: null, resting_hr: null, threshold_pace: null,
  },
  "/api/v1/integrations": [],
  "/api/v1/integrations/intervals_icu": {
    source: "intervals_icu", connected: false, settings: { sync_frequency: "daily", auto_sync: true },
    last_sync_at: null, last_sync_status: null, last_sync_error: null, last_sync_detail: null,
    created_at: null, updated_at: null, data_as_of: null, staleness_bucket: "missing",
  },
  "/api/v1/integrations/intervals_icu/coverage": {
    source: "intervals_icu", first_activity_date: null, last_activity_date: null,
    activity_count: 0,
  },
  "/api/v1/integrations/intervals_icu/jobs/current": null,
  "/api/v1/integrations/sync-runs": [],
  "/api/v1/metrics/series/batch": { grain: "daily", series: [] },
  "/api/v1/plan/active": EMPTY_PLAN,
  "/api/v1/plan/adjustments": { adjustments: [] },
  "/api/v1/pmc": [],
  "/api/v1/race-results": [],
  "/api/v1/race/predict": { predictions: [] },
  "/api/v1/race/predictions": [],
  "/api/v1/strength/analytics/distribution": [],
  "/api/v1/strength/analytics/e1rm": [],
  "/api/v1/strength/analytics/muscle-volume": [],
  "/api/v1/strength/exercises": [],
  "/api/v1/strength/workouts": [],
  "/api/v1/gear/shoes": [],
  "/api/v1/wellness": [],
  "/api/v1/workouts/predict": [],
  "/api/v1/workouts/templates": [],
};

export function dashboardFixture(pathname: string): JsonFixture | undefined {
  return DASHBOARD_FIXTURES[pathname];
}
