"use client";

import { useId, useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { formatPace } from "@shared/lib/format";
import { normalizeGpsTrack } from "@features/activity/lib/gps-track";
import type { StreamMap, StreamPoint } from "@shared/types/activity";

interface ColoredGpsTrackProps {
  streams: StreamMap;
}

interface Point {
  x: number;
  y: number;
  speed: number | null;
}

type Scale = {
  readonly minX: number;
  readonly minY: number;
  readonly scaleX: number;
  readonly scaleY: number;
};

const SVG_W = 600;
const SVG_H = 200;
const PAD = 8;
/** Points per colored segment – smaller = smoother gradient, more DOM nodes. */
const CHUNK = 6;
const NO_SPEED_COLOR = "var(--color-text-muted)";

function buildPoints(streams: StreamMap): Point[] {
  const track = normalizeGpsTrack(streams).points;
  const speed: StreamPoint[] = streams["speed"] ?? [];
  const scale = buildScale(track);
  const speedTs = speed.map((p) => ({ t: new Date(p.sample_time).getTime(), v: p.value }));
  const pts: Point[] = [];
  let sIdx = 0;
  for (const trackPoint of track) {
    const t = new Date(trackPoint.sample_time).getTime();
    sIdx = nearestSpeedIndex(speedTs, sIdx, t);
    const cur = speedTs[sIdx];
    const sp = cur && Math.abs(cur.t - t) < 15000 ? cur.v : null;
    pts.push({
      x: PAD + (trackPoint.lon - scale.minX) * scale.scaleX,
      y: SVG_H - PAD - (trackPoint.lat - scale.minY) * scale.scaleY,
      speed: sp,
    });
  }
  return pts;
}

function buildScale(track: ReturnType<typeof normalizeGpsTrack>["points"]): Scale {
  const minX = Math.min(...track.map((point) => point.lon));
  const maxX = Math.max(...track.map((point) => point.lon));
  const minY = Math.min(...track.map((point) => point.lat));
  const maxY = Math.max(...track.map((point) => point.lat));
  return {
    minX,
    minY,
    scaleX: (SVG_W - PAD * 2) / (maxX - minX || 1),
    scaleY: (SVG_H - PAD * 2) / (maxY - minY || 1),
  };
}

function nearestSpeedIndex(speedTs: readonly { readonly t: number; readonly v: number }[], startIndex: number, targetTime: number): number {
  let index = startIndex;
  while (shouldAdvanceSpeedIndex(speedTs, index, targetTime)) index += 1;
  return index;
}

function shouldAdvanceSpeedIndex(speedTs: readonly { readonly t: number }[], index: number, targetTime: number): boolean {
  const current = speedTs[index];
  const next = speedTs[index + 1];
  return current != null && next != null && Math.abs(next.t - targetTime) < Math.abs(current.t - targetTime);
}

/**
 * Map speed to a theme-responsive color: fast (green) → slow (red) via yellow.
 * Blends the semantic success/warning/error tokens so both light and dark
 * themes stay legible (no hardcoded hues).
 */
function speedToColor(speed: number | null, min: number, max: number): string {
  if (speed == null || max === min) return NO_SPEED_COLOR;
  const ratio = Math.min(1, Math.max(0, (speed - min) / (max - min)));
  if (ratio <= 0.5) {
    return `color-mix(in oklab, var(--color-error) ${(1 - ratio * 2) * 100}%, var(--color-warning))`;
  }
  return `color-mix(in oklab, var(--color-warning) ${(1 - ratio) * 200}%, var(--color-success))`;
}

export function ColoredGpsTrack({ streams }: ColoredGpsTrackProps) {
  const pts = useMemo(() => buildPoints(streams), [streams]);
  const gridPatternId = useId();
  const { segments, minSpeed, maxSpeed } = useMemo(() => {
    if (pts.length < 2) return { segments: [], minSpeed: 0, maxSpeed: 0 };
    const speeds = pts
      .map((p) => p.speed)
      .filter((s): s is number => s != null && s > 0);
    const min = speeds.length ? Math.min(...speeds) : 0;
    const max = speeds.length ? Math.max(...speeds) : 0;

    const segs: { points: string; color: string }[] = [];
    for (let i = 0; i < pts.length - 1; i += CHUNK - 1) {
      const chunk = pts.slice(i, i + CHUNK);
      const avgSpd = chunk.reduce((a, c) => a + (c.speed ?? 0), 0) / chunk.length;
      const hasAny = chunk.some((c) => c.speed != null);
      const color = hasAny ? speedToColor(avgSpd, min, max) : NO_SPEED_COLOR;
      segs.push({
        points: chunk.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
        color,
      });
    }
    return { segments: segs, minSpeed: min, maxSpeed: max };
  }, [pts]);

  if (pts.length < 2) {
    return (
      <Card padding="sm">
        <p className="text-caption1 text-text-muted">暂无 GPS 数据</p>
      </Card>
    );
  }

  return (
    <Card padding="sm" className="relative" data-testid="gps-map">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-subheadline font-semibold text-text-secondary">GPS · 配速着色</h2>
        <div className="flex items-center gap-2 text-caption2 text-text-muted">
          <span className="hidden sm:inline">慢</span>
          <div
            className="h-1.5 w-20 rounded-full"
            style={{
              background:
                "linear-gradient(to right, var(--color-error), var(--color-warning), var(--color-success))",
            }}
            aria-hidden
          />
          <span className="hidden sm:inline">快</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="h-[200px] w-full rounded-md"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id={gridPatternId} width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="var(--color-gps-map-grid)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width={SVG_W} height={SVG_H} fill="var(--color-gps-map-bg)" rx="4" />
        <rect width={SVG_W} height={SVG_H} fill={`url(#${gridPatternId})`} rx="4" />
        {segments.map((seg, i) => (
          <polyline
            data-testid="gps-track-polyline"
            key={i}
            points={seg.points}
            fill="none"
            style={{ stroke: seg.color }}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      {maxSpeed > 0 && (
        <p className="mt-2 text-center text-caption1 text-text-muted">
          最快 {formatPace(maxSpeed)} · 最慢 {formatPace(minSpeed)}
        </p>
      )}
    </Card>
  );
}
