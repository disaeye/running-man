"use client";

import type { GpsTrackPoint } from "@features/activity/lib/gps-track";
import type { StreamMap, StreamPoint } from "@shared/types/activity";

export interface TrackSample {
  readonly point: GpsTrackPoint;
  /** 相对纪元的秒时间戳 */
  readonly timeSec: number;
  /** 就近速度流数值（m/s），超过容差视为无数据 */
  readonly speed: number | null;
  readonly hr: number | null;
}

const JOIN_TOLERANCE_MS = 15000;
export const NO_DATA_COLOR = "var(--color-text-muted)";

/** 将速度/心率流按时间就近合并到轨迹点上（输入均按时间升序） */
export function joinTrackSamples(
  track: readonly GpsTrackPoint[],
  streams: StreamMap,
): TrackSample[] {
  const speedLookup = nearestValueLookup(streams["speed"] ?? []);
  const hrLookup = nearestValueLookup(streams["heart_rate"] ?? []);
  return track.map((point) => {
    const timeSec = new Date(point.sample_time).getTime() / 1000;
    return {
      point,
      timeSec,
      speed: speedLookup(timeSec),
      hr: hrLookup(timeSec),
    };
  });
}

function nearestValueLookup(rows: readonly StreamPoint[]): (timeSec: number) => number | null {
  const ts = rows.map((p) => ({ t: new Date(p.sample_time).getTime(), v: p.value }));
  let cursor = 0;
  return (timeSec: number) => {
    const t = timeSec * 1000;
    while (
      cursor + 1 < ts.length &&
      Math.abs(ts[cursor + 1]!.t - t) < Math.abs(ts[cursor]!.t - t)
    ) {
      cursor += 1;
    }
    const current = ts[cursor];
    return current != null && Math.abs(current.t - t) < JOIN_TOLERANCE_MS ? current.v : null;
  };
}

/** 慢（红）→ 中（黄）→ 快（绿），与配速着色图例一致 */
export function speedToColor(speed: number | null, min: number, max: number): string {
  if (speed == null || max === min) return NO_DATA_COLOR;
  const ratio = Math.min(1, Math.max(0, (speed - min) / (max - min)));
  if (ratio <= 0.5) {
    return `color-mix(in oklab, var(--color-error) ${((1 - ratio) * 2 * 100).toFixed(0)}%, var(--color-warning))`;
  }
  return `color-mix(in oklab, var(--color-warning) ${((1 - ratio) * 2 * 100).toFixed(0)}%, var(--color-success))`;
}

/** 低（主色）→ 中（警告）→ 高（危险），对应心率强度 */
export function hrToColor(hr: number | null, min: number, max: number): string {
  if (hr == null || max === min) return NO_DATA_COLOR;
  const ratio = Math.min(1, Math.max(0, (hr - min) / (max - min)));
  if (ratio <= 0.5) {
    return `color-mix(in oklab, var(--color-primary) ${((1 - ratio) * 2 * 100).toFixed(0)}%, var(--color-warning))`;
  }
  return `color-mix(in oklab, var(--color-warning) ${((1 - ratio) * 2 * 100).toFixed(0)}%, var(--color-destructive))`;
}
