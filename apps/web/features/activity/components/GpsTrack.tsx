"use client";

import { useId, useMemo } from "react";
import { normalizeGpsTrack } from "@features/activity/lib/gps-track";
import { projectGpsTrack } from "@features/activity/lib/gps-projection";
import type { StreamMap } from "@shared/types/activity";

interface GpsTrackProps {
  streams: StreamMap;
  hoverTimeSec?: number | null;
}

const SVG_W = 600;
const SVG_H = 280;
const PAD = 28;

export function GpsTrack({ streams, hoverTimeSec = null }: GpsTrackProps) {
  const coords = useMemo(() => normalizeGpsTrack(streams).points, [streams]);
  const gridPatternId = useId();

  const { pointsStr, projectedPoints, start, finish } = useMemo(() => {
    if (coords.length < 2) {
      return { pointsStr: "", projectedPoints: [], start: null, finish: null };
    }
    const projection = projectGpsTrack(coords, {
      width: SVG_W,
      height: SVG_H,
      pad: PAD,
    });
    const pts = projection.points.map((p) => `${p.x},${p.y}`).join(" ");
    return {
      pointsStr: pts,
      projectedPoints: projection.points,
      start: projection.start,
      finish: projection.finish,
    };
  }, [coords]);

  const hoverPoint = useMemo(() => {
    if (hoverTimeSec == null || coords.length < 2 || projectedPoints.length < 2) return null;
    const t0 = Date.parse(coords[0]!.sample_time);
    if (!Number.isFinite(t0)) return null;
    const isEpochSec = hoverTimeSec >= 1e9;
    let bestIdx = 0;
    let bestDelta = Infinity;
    let largestGap = 0;
    let previousSec = 0;
    for (let i = 0; i < coords.length; i += 1) {
      const sampleMs = Date.parse(coords[i]!.sample_time);
      const sec = isEpochSec ? sampleMs / 1000 : (sampleMs - t0) / 1000;
      if (i > 0) largestGap = Math.max(largestGap, sec - previousSec);
      previousSec = sec;
      const delta = Math.abs(sec - hoverTimeSec);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }
    return bestDelta <= Math.max(20, largestGap) ? (projectedPoints[bestIdx] ?? null) : null;
  }, [hoverTimeSec, coords, projectedPoints]);

  if (coords.length < 2 || !start || !finish) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl bg-secondary/40 text-caption1 text-muted-foreground">
        暂无 GPS 数据
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border-subtle bg-secondary/20"
      data-testid="gps-map"
    >
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="h-[280px] w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id={gridPatternId} width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="var(--color-gps-map-grid)"
              strokeWidth="0.5"
              strokeOpacity="0.4"
            />
          </pattern>
        </defs>

        {/* 底层与网格 */}
        <rect width={SVG_W} height={SVG_H} fill="var(--color-gps-map-bg)" />
        <rect width={SVG_W} height={SVG_H} fill={`url(#${gridPatternId})`} />

        {/* 轨迹发光外轮廓层 */}
        <polyline
          points={pointsStr}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.18"
        />
        <polyline
          points={pointsStr}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.4"
        />

        {/* 主轨迹高亮线条 */}
        <polyline
          data-testid="gps-track-polyline"
          points={pointsStr}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 起点标记（绿） */}
        <circle
          cx={start.x}
          cy={start.y}
          r="8"
          fill="var(--color-success)"
          fillOpacity="0.25"
        />
        <circle
          cx={start.x}
          cy={start.y}
          r="4.5"
          fill="var(--color-success)"
          stroke="var(--color-background)"
          strokeWidth="1.5"
        />

        {/* 终点标记（红） */}
        <circle
          cx={finish.x}
          cy={finish.y}
          r="8"
          fill="var(--color-destructive)"
          fillOpacity="0.25"
        />
        <circle
          cx={finish.x}
          cy={finish.y}
          r="4.5"
          fill="var(--color-destructive)"
          stroke="var(--color-background)"
          strokeWidth="1.5"
        />

        {hoverPoint ? (
          <circle
            cx={hoverPoint.x}
            cy={hoverPoint.y}
            r="6"
            fill="var(--color-primary)"
            fillOpacity="0.35"
            stroke="var(--color-primary)"
            strokeWidth="2"
          />
        ) : null}

        {/* 指北针 */}
        <g transform={`translate(${SVG_W - 36}, 24)`} opacity="0.65">
          <circle r="12" fill="var(--color-background)" fillOpacity="0.6" stroke="var(--color-border)" strokeWidth="0.8" />
          <path d="M 0 -8 L 3.5 3 L 0 1 L -3.5 3 Z" fill="var(--color-destructive)" />
          <path d="M 0 8 L 3.5 3 L 0 1 L -3.5 3 Z" fill="var(--color-muted-foreground)" />
          <text y="-14" textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="9" fontWeight="bold">N</text>
        </g>
      </svg>

      {/* 底部信息与图例 */}
      <div className="absolute bottom-2.5 left-3 flex items-center gap-3 rounded-full border border-border-default bg-surface-card/95 px-2.5 py-1 text-caption1">
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-success" /> 起点
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-destructive" /> 终点
        </span>
        <span className="num font-mono text-muted-foreground/80">
          {coords.length} 点
        </span>
      </div>
    </div>
  );
}
