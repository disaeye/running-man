/** 运动流图的取值、平滑与共享时间轴计算 */

import type { StreamMap, StreamPoint } from "@shared/types/activity";

export interface TimePoint {
  timeSec: number;
  value: number;
}

/** 秒时间戳，流数据的唯一横轴 */
export function timeOf(point: StreamPoint): number {
  return new Date(point.sample_time).getTime() / 1000;
}

/** 滑动平均：窗口内只统计存在的样本，用来压住配速的锯齿 */
export function smoothSeries(points: readonly TimePoint[], window: number): TimePoint[] {
  if (window <= 1) return [...points];
  const out: TimePoint[] = [];
  let sum = 0;
  const queue: number[] = [];
  for (const point of points) {
    queue.push(point.value);
    sum += point.value;
    if (queue.length > window) sum -= queue.shift() ?? 0;
    out.push({ timeSec: point.timeSec, value: sum / queue.length });
  }
  return out;
}

export function paceSeries(streams: StreamMap): TimePoint[] {
  const raw = streams["speed"] ?? [];
  const points: TimePoint[] = [];
  for (const point of raw) {
    if (point.value > 0.5 && point.value < 12) {
      points.push({ timeSec: timeOf(point), value: 1000 / point.value });
    }
  }
  return smoothSeries(points, 11);
}

export function heartRateSeries(streams: StreamMap): TimePoint[] {
  return (streams["heart_rate"] ?? [])
    .filter((point) => point.value > 30 && point.value < 240)
    .map((point) => ({ timeSec: timeOf(point), value: point.value }));
}

export function altitudeSeries(streams: StreamMap): TimePoint[] {
  return (streams["altitude"] ?? []).map((point) => ({
    timeSec: timeOf(point),
    value: point.value,
  }));
}

export interface TimeDomain {
  start: number;
  end: number;
}

/** 三条流共用的时间跨度，纵轴各算各的 */
export function sharedDomain(series: readonly (readonly TimePoint[])[]): TimeDomain | null {
  let start = Infinity;
  let end = -Infinity;
  for (const points of series) {
    for (const point of points) {
      if (point.timeSec < start) start = point.timeSec;
      if (point.timeSec > end) end = point.timeSec;
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

/** 时间点上的值：取最近样本，超过容差视为没有数据 */
export function valueAt(points: readonly TimePoint[], timeSec: number, toleranceSec = 20): number | null {
  if (points.length === 0) return null;
  let best: TimePoint | null = null;
  let bestDelta = Infinity;
  for (const point of points) {
    const delta = Math.abs(point.timeSec - timeSec);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = point;
    }
  }
  return best && bestDelta <= toleranceSec ? best.value : null;
}

/** 时间刻度标签：mm:ss */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
