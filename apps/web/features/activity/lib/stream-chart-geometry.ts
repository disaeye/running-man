import { clipToDomain, weightedAverage, type TimeDomain, type TimePoint } from "@features/activity/lib/stream-series";

export const STREAM_VIEW_W = 600;
export const STREAM_VIEW_H = 76;
export const STREAM_PAD_X = 8;
export const STREAM_PAD_Y = 8;

export function buildStreamGeometry(points: readonly TimePoint[], domain: TimeDomain, invertY: boolean) {
  const visiblePoints = clipToDomain(points, domain);
  if (visiblePoints.length < 2) return null;
  const values = visiblePoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const span = domain.end - domain.start;
  const toX = (timeSec: number) => STREAM_PAD_X + ((timeSec - domain.start) / span) * (STREAM_VIEW_W - STREAM_PAD_X * 2);
  const toY = (value: number) => {
    const ratio = (value - min) / range;
    return invertY ? STREAM_PAD_Y + ratio * (STREAM_VIEW_H - STREAM_PAD_Y * 2) : STREAM_VIEW_H - STREAM_PAD_Y - ratio * (STREAM_VIEW_H - STREAM_PAD_Y * 2);
  };
  const line = visiblePoints.map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.timeSec).toFixed(1)} ${toY(point.value).toFixed(1)}`).join(" ");
  const baseline = invertY ? STREAM_PAD_Y : STREAM_VIEW_H - STREAM_PAD_Y;
  return {
    visiblePoints,
    line,
    area: `${line} L ${toX(visiblePoints[visiblePoints.length - 1]!.timeSec).toFixed(1)} ${baseline} L ${toX(visiblePoints[0]!.timeSec).toFixed(1)} ${baseline} Z`,
    toX,
    toY,
    average: weightedAverage(visiblePoints),
  };
}
