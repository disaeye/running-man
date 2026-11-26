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

/** 三条流共用活动有效训练时间，纵轴各算各的。 */
export function sharedDomain(
  series: readonly (readonly TimePoint[])[],
  activityStartTime?: string,
  activityDurationS?: number | null,
): TimeDomain | null {
  const start = activityStartTime ? new Date(activityStartTime).getTime() / 1000 : NaN;
  if (Number.isFinite(start) && activityDurationS != null && activityDurationS > 0) {
    return { start, end: start + activityDurationS };
  }
  return streamDomain(series);
}

function streamDomain(series: readonly (readonly TimePoint[])[]): TimeDomain | null {
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

export function clipToDomain(points: readonly TimePoint[], domain: TimeDomain): TimePoint[] {
  return points.filter((point) => point.timeSec >= domain.start && point.timeSec <= domain.end);
}

/** 按样本到下一个样本的时间加权，采样间隔变化不会扭曲平均值。 */
export function weightedAverage(points: readonly TimePoint[]): number | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0]!.value;
  let weightedSum = 0;
  let duration = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    const seconds = Math.max(0, next.timeSec - current.timeSec);
    weightedSum += current.value * seconds;
    duration += seconds;
  }
  return duration > 0 ? weightedSum / duration : points.at(-1)!.value;
}

/** 时间点上的值：取最近样本，超过容差视为没有数据 */
export function valueAt(points: readonly TimePoint[], timeSec: number, toleranceSec?: number): number | null {
  if (points.length === 0) return null;
  const intervals = points.slice(1).map((point, index) => point.timeSec - points[index]!.timeSec).filter((seconds) => seconds > 0);
  const sampleInterval = intervals.length > 0 ? Math.max(...intervals) : 20;
  const tolerance = toleranceSec ?? Math.max(20, sampleInterval);
  let best: TimePoint | null = null;
  let bestDelta = Infinity;
  for (const point of points) {
    const delta = Math.abs(point.timeSec - timeSec);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = point;
    }
  }
  return best && bestDelta <= tolerance ? best.value : null;
}

/** 时间刻度标签：mm:ss */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
