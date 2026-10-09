/** Types mirroring the Python API schemas. */

export interface ActivitySummary {
  activity_id: string;
  start_time: string;
  sport: string;
  distance_m: number | null;
  duration_s: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power: number | null;
  np: number | null;
  intensity_factor: number | null;
  tss: number | null;
  icu_ctl: number | null;
  avg_cadence: number | null;
  avg_speed: number | null;
  elevation_gain_m: number | null;
  calories: number | null;
  external_id: string | null;
  source: string | null;
  file_type: string | null;
  device_name: string | null;
  summary_polyline?: string | null;
  /** Whether the activity carries GPS; drives the "GPS only" filter. */
  has_gps?: boolean;
}

/** 单次活动的天气块（Intervals.icu 活动天气字段，无天气时为 null）。 */
export interface ActivityWeather {
  avg_temp?: number | null;
  min_temp?: number | null;
  max_temp?: number | null;
  feels_like?: number | null;
  wind_speed?: number | null;
  wind_gust?: number | null;
  wind_deg?: number | null;
  headwind_pct?: number | null;
  tailwind_pct?: number | null;
  clouds_pct?: number | null;
  max_rain?: number | null;
  max_snow?: number | null;
}

export interface ActivityDetail extends ActivitySummary {
  raw_data: unknown;
  has_hr?: boolean;
  has_power?: boolean;
  has_cadence?: boolean;
  readonly weather?: ActivityWeather | null;
  readonly synced_at?: string | null;
  readonly streams_synced_at?: string | null;
  readonly stream_sample_count?: number | null;
}

export interface StreamPoint {
  sample_time: string;
  metric_type: string;
  value: number;
  lat: number | null;
  lon: number | null;
  alt: number | null;
}

/** Grouped stream data keyed by metric_type. */
export type StreamMap = Record<string, StreamPoint[]>;

/** Group raw stream points by metric_type. */
export function groupStreams(streams: StreamPoint[]): StreamMap {
  const map: StreamMap = {};
  for (const pt of streams) {
    (map[pt.metric_type] ??= []).push(pt);
  }
  return map;
}
