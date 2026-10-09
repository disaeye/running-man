import type { StreamMap, StreamPoint } from "@shared/types/activity";

export type GpsTrackPoint = {
  readonly lat: number;
  readonly lon: number;
  readonly sample_time: string;
  readonly alt?: number;
};

export type GpsTrackStatus = "invalid" | "partial" | "valid";

export type GpsTrackResult = {
  readonly status: GpsTrackStatus;
  readonly points: readonly GpsTrackPoint[];
};

type GpsTrackInput = StreamMap | readonly StreamPoint[];

export function normalizeGpsTrack(input: GpsTrackInput): GpsTrackResult {
  if (isStreamRows(input)) {
    return gpsTrackResult(rowsToMetadataPoints(input));
  }

  const rows = Object.values(input).flat();
  const metadataPoints = rowsToMetadataPoints(rows);
  if (metadataPoints.length > 0) {
    return gpsTrackResult(metadataPoints);
  }
  return gpsTrackResult(rowsToLegacyPoints(input));
}

function isStreamRows(input: GpsTrackInput): input is readonly StreamPoint[] {
  return Array.isArray(input);
}

function gpsTrackResult(points: readonly GpsTrackPoint[]): GpsTrackResult {
  if (points.length >= 2) {
    return { status: "valid", points };
  }
  if (points.length === 1) {
    return { status: "partial", points };
  }
  return { status: "invalid", points };
}

function rowsToMetadataPoints(rows: readonly StreamPoint[]): readonly GpsTrackPoint[] {
  const byTime = new Map<string, GpsTrackPoint>();
  for (const row of rows) {
    const point = pointFromRowMetadata(row);
    if (point !== null && !byTime.has(point.sample_time)) {
      byTime.set(point.sample_time, point);
    }
  }
  return [...byTime.values()];
}

function pointFromRowMetadata(row: StreamPoint): GpsTrackPoint | null {
  if (!isValidLatitude(row.lat) || !isValidLongitude(row.lon)) {
    return null;
  }
  if (isFiniteNumber(row.alt)) {
    return { lat: row.lat, lon: row.lon, sample_time: row.sample_time, alt: row.alt };
  }
  return { lat: row.lat, lon: row.lon, sample_time: row.sample_time };
}

function rowsToLegacyPoints(input: StreamMap): readonly GpsTrackPoint[] {
  const latitudes = input["latitude"] ?? [];
  const longitudes = input["longitude"] ?? [];
  const limit = Math.min(latitudes.length, longitudes.length);
  const points: GpsTrackPoint[] = [];

  for (let index = 0; index < limit; index += 1) {
    const latitude = latitudes[index];
    const longitude = longitudes[index];
    if (latitude === undefined || longitude === undefined) {
      continue;
    }
    if (!isValidLatitude(latitude.value) || !isValidLongitude(longitude.value)) {
      continue;
    }
    const altitude = isFiniteNumber(latitude.alt) ? latitude.alt : longitude.alt;
    if (isFiniteNumber(altitude)) {
      points.push({ lat: latitude.value, lon: longitude.value, sample_time: latitude.sample_time, alt: altitude });
    } else {
      points.push({ lat: latitude.value, lon: longitude.value, sample_time: latitude.sample_time });
    }
  }

  return points;
}

function isValidLatitude(value: number | null): value is number {
  return isFiniteNumber(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return isFiniteNumber(value) && value >= -180 && value <= 180;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
