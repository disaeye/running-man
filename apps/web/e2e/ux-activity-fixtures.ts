export const ACTIVITY = {
  activity_id: "e2e-overflow",
  start_time: "2026-07-01T08:00:00Z",
  sport: "Run",
  distance_m: 21100,
  duration_s: 6420,
  avg_hr: 152,
  max_hr: 174,
  avg_power: null,
  np: null,
  intensity_factor: null,
  tss: 118,
  icu_ctl: 54,
  avg_cadence: 178,
  avg_speed: 3.28,
  elevation_gain_m: 240,
  calories: 1400,
  external_id: "i12345",
  source: "intervals_icu",
  file_type: "fit",
  device_name: "Garmin Forerunner 265",
  raw_data: null,
  has_gps: false,
  has_hr: true,
  has_power: false,
  has_cadence: true,
  weather: null,
  summary_polyline: null,
};

export const ACTIVITY_ANALYSIS = {
  hr_zones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
  laps: [],
  power_curve: [],
  summary: { np: null, if: null, tss: null, decoupling_pct: null },
};

export const SHARE = {
  sport: "Run",
  date: "2026-07-17",
  duration_s: 6420,
  distance_m: 21100,
  name: "周末长距离：滨江往返",
};

export type ActivityFixture = object | readonly object[] | null;

export function activityFixture(pathname: string): ActivityFixture | undefined {
  const match = pathname.match(/^\/api\/v1\/activities\/([^/]+)(?:\/(analysis|streams|laps))?$/);
  if (match === null) return undefined;
  const [, activityId, resource] = match;
  if (resource === "streams") return [];
  if (resource === "laps") return [];
  if (resource === "analysis") return ACTIVITY_ANALYSIS;
  return { ...ACTIVITY, activity_id: activityId };
}
