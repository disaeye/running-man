import type { useParams } from "next/navigation";
import type { ActivityDetail as ActivityDetailType, StreamMap } from "@shared/types/activity";
import type { SportConfig } from "@shared/config/sport-config";
import { normalizeGpsTrack } from "@features/activity/lib/gps-track";

export type GpsUiState = "empty" | "partial" | "valid";

export type ActivityCapabilityKey = "has_gps" | "has_hr" | "has_power" | "has_cadence";

export interface ActivityAvailability {
  hasGps: boolean;
  hasHr: boolean;
  hasPower: boolean;
  hasCadence: boolean;
  hasLaps: boolean;
}

export function sportSubtitle(config: SportConfig): string {
  if (config.isRun) return "训练 · 有氧节奏";
  if (config.isRide) return "骑行 · 功率/心率";
  if (config.isWater) return "水域训练";
  return "训练活动";
}

export function resolveGpsState(activity: ActivityDetailType | null, streamMap: StreamMap): GpsUiState {
  const gpsTrack = normalizeGpsTrack(streamMap);
  if (gpsTrack.status === "valid") return "valid";
  if (gpsTrack.status === "partial" || parseProv(activity, "has_gps") === true) return "partial";
  return "empty";
}

export function extractId(params: ReturnType<typeof useParams>): string {
  if (typeof params?.id === "string") return params.id;
  if (Array.isArray(params?.id)) return params.id[0] ?? "";
  return "";
}

export function parseProv(activity: ActivityDetailType | null, key: ActivityCapabilityKey): boolean | undefined {
  if (!activity) return undefined;
  return activity[key];
}

export function checkMetric(
  activity: ActivityDetailType | null,
  streamMap: StreamMap,
  provKey: ActivityCapabilityKey,
  streamKey: string,
): boolean {
  const prov = parseProv(activity, provKey);
  if (prov !== undefined) return prov;
  const arr = streamMap[streamKey];
  return arr ? arr.length > 0 : false;
}

export function countLaps(analysis: unknown): number {
  if (!analysis) return 0;
  const a = analysis as Record<string, unknown>;
  const laps = a.laps;
  return Array.isArray(laps) ? laps.length : 0;
}

export function computeAvailability(
  activity: ActivityDetailType | null,
  streamMap: StreamMap,
  analysis: unknown,
): ActivityAvailability {
  const gpsState = resolveGpsState(activity, streamMap);
  return {
    hasGps: gpsState === "valid",
    hasHr: checkMetric(activity, streamMap, "has_hr", "heart_rate"),
    hasPower: checkMetric(activity, streamMap, "has_power", "power"),
    hasCadence: checkMetric(activity, streamMap, "has_cadence", "cadence"),
    hasLaps: countLaps(analysis) > 0,
  };
}
