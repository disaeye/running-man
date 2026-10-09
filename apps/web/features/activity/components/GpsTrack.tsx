"use client";

import { useId, useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { normalizeGpsTrack, type GpsTrackPoint } from "@features/activity/lib/gps-track";
import type { StreamMap } from "@shared/types/activity";

interface GpsTrackProps {
  streams: StreamMap;
}

const SVG_W = 600;
const SVG_H = 200;
const PAD = 8;

export function GpsTrack({ streams }: GpsTrackProps) {
  const coords = useMemo(() => normalizeGpsTrack(streams).points, [streams]);
  const gridPatternId = useId();

  if (coords.length < 2) {
    return (
      <Card padding="sm">
        <p className="text-caption1 text-text-muted">暂无 GPS 数据</p>
      </Card>
    );
  }

  const minLat = Math.min(...coords.map((c) => c.lat));
  const maxLat = Math.max(...coords.map((c) => c.lat));
  const minLon = Math.min(...coords.map((c) => c.lon));
  const maxLon = Math.max(...coords.map((c) => c.lon));

  const scaleX = (SVG_W - PAD * 2) / (maxLon - minLon || 1);
  const scaleY = (SVG_H - PAD * 2) / (maxLat - minLat || 1);

  const toSvg = (c: GpsTrackPoint) => ({
    x: PAD + (c.lon - minLon) * scaleX,
    y: SVG_H - PAD - (c.lat - minLat) * scaleY,
  });

  return (
    <Card padding="sm" className="relative" data-testid="gps-map">
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
        <polyline
          data-testid="gps-track-polyline"
          points={coords
            .map((c) => {
              const p = toSvg(c);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(" ")}
          fill="none"
          stroke="var(--color-ctl)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </Card>
  );
}
