// 轨迹抽稀与平滑：控制 DOM 规模，保持形状可辨认
import type { GpsTrackPoint } from "@features/activity/lib/gps-track";

const MAX_POINTS = 1200;

/**
 * 步进采样到 MAX_POINTS 以内，再做 3 点移动平均（保留首尾点）。
 * 时间与海拔取窗口中心点，位置取三点平均，消减锯齿。
 */
export function simplifyTrack(points: readonly GpsTrackPoint[]): GpsTrackPoint[] {
  const sampled = strideSample(points);
  if (sampled.length < 3) return [...sampled];
  const out: GpsTrackPoint[] = [sampled[0]!];
  for (let i = 1; i < sampled.length - 1; i += 1) {
    const a = sampled[i - 1]!;
    const b = sampled[i]!;
    const c = sampled[i + 1]!;
    const lat = (a.lat + b.lat + c.lat) / 3;
    const lon = (a.lon + b.lon + c.lon) / 3;
    const point: GpsTrackPoint =
      b.alt != null && Number.isFinite(b.alt)
        ? { lat, lon, sample_time: b.sample_time, alt: b.alt }
        : { lat, lon, sample_time: b.sample_time };
    out.push(point);
  }
  out.push(sampled[sampled.length - 1]!);
  return out;
}

function strideSample(points: readonly GpsTrackPoint[]): GpsTrackPoint[] {
  if (points.length <= MAX_POINTS) return [...points];
  const stride = Math.ceil(points.length / MAX_POINTS);
  const out: GpsTrackPoint[] = [];
  for (let i = 0; i < points.length; i += stride) {
    out.push(points[i]!);
  }
  const last = points[points.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const EARTH_RADIUS_M = 6371008.8;

/** 每个点的累计距离（公里），用于公里刻度与回放读数 */
export function cumulativeDistancesKm(points: readonly GpsTrackPoint[]): number[] {
  const out = new Array<number>(points.length).fill(0);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    out[i] = out[i - 1]! + haversineKm(prev, cur);
  }
  return out;
}

function haversineKm(a: GeoLike, b: GeoLike): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))) / 1000;
}

interface GeoLike {
  readonly lat: number;
  readonly lon: number;
}
