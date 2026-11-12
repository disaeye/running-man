"use client";

import { useMemo } from "react";
import { decodePolyline } from "@shared/lib/decode-polyline";
import { projectGpsTrack } from "@features/activity/lib/gps-projection";

const SVG_W = 600;
const SVG_H = 200;
const PAD = 16;

/**
 * Decorative SVG route background for activity cards. Decodes a Google-encoded
 * polyline string and renders it as a faint SVG stroke, positioned absolutely
 * behind card content. Returns null when no polyline data is available.
 */
export function RouteBackground({
  polyline,
  sportColor = "var(--color-ctl)",
}: {
  polyline?: string | null;
  sportColor?: string;
}) {
  const pointsStr = useMemo(() => {
    if (!polyline) return null;
    const pts = decodePolyline(polyline, 5);
    if (pts.length < 2) return null;

    const projection = projectGpsTrack(pts, {
      width: SVG_W,
      height: SVG_H,
      pad: PAD,
    });

    return projection.points.map((p) => `${p.x},${p.y}`).join(" ");
  }, [polyline]);

  if (!pointsStr) return null;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <polyline
        points={pointsStr}
        fill="none"
        stroke={sportColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        style={{ opacity: 0.15 }}
      />
    </svg>
  );
}
