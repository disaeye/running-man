"use client";

import { useMemo } from "react";
import { decodePolyline } from "@shared/lib/decode-polyline";

const SVG_W = 600;
const SVG_H = 200;
const PAD = 8;

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

    const minLat = Math.min(...pts.map((p) => p.lat));
    const maxLat = Math.max(...pts.map((p) => p.lat));
    const minLon = Math.min(...pts.map((p) => p.lon));
    const maxLon = Math.max(...pts.map((p) => p.lon));

    const scaleX = (SVG_W - PAD * 2) / (maxLon - minLon || 1);
    const scaleY = (SVG_H - PAD * 2) / (maxLat - minLat || 1);

    return pts
      .map(
        (p) =>
          `${(PAD + (p.lon - minLon) * scaleX).toFixed(1)},${(SVG_H - PAD - (p.lat - minLat) * scaleY).toFixed(1)}`,
      )
      .join(" ");
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
