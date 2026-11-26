"use client";

import { useMemo } from "react";
import { decodePolyline } from "@shared/lib/decode-polyline";
import { projectGpsTrack } from "@features/activity/lib/gps-projection";

const THUMB_W = 96;
const THUMB_H = 72;
const THUMB_PAD = 10;

/**
 * 迷你 GPS 轨迹缩略框（对标 COROS Activities / Garmin 活动列表右侧轨迹图）。
 * 无轨迹数据时返回 null，保持力量训练或室内跑卡片干净对齐。
 */
export function MiniRouteThumbnail({
  polyline,
  sportColor = "var(--color-sport-run)",
  className = "",
}: {
  readonly polyline?: string | null;
  readonly sportColor?: string;
  readonly className?: string;
}) {
  const projected = useMemo(() => {
    if (!polyline) return null;
    const decoded = decodePolyline(polyline, 5);
    if (decoded.length < 2) return null;
    const result = projectGpsTrack(decoded, {
      width: THUMB_W,
      height: THUMB_H,
      pad: THUMB_PAD,
    });
    if (result.points.length < 2) return null;
    return {
      pointsAttr: result.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      start: result.points[0]!,
      end: result.points[result.points.length - 1]!,
    };
  }, [polyline]);

  if (!projected) return null;

  return (
    <div
      aria-hidden="true"
      className={`relative h-[56px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-border-subtle bg-surface-overlay sm:h-[68px] sm:w-[88px] ${className}`.trim()}
    >
      <svg
        viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <line x1="0" y1="24" x2={THUMB_W} y2="24" stroke="var(--color-border-subtle)" strokeWidth="0.75" />
        <line x1="0" y1="48" x2={THUMB_W} y2="48" stroke="var(--color-border-subtle)" strokeWidth="0.75" />
        <line x1="32" y1="0" x2="32" y2={THUMB_H} stroke="var(--color-border-subtle)" strokeWidth="0.75" />
        <line x1="64" y1="0" x2="64" y2={THUMB_H} stroke="var(--color-border-subtle)" strokeWidth="0.75" />
        <polyline
          points={projected.pointsAttr}
          fill="none"
          stroke={sportColor}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={projected.start.x} cy={projected.start.y} r="3" fill="var(--color-success)" />
        <circle cx={projected.end.x} cy={projected.end.y} r="3" fill="var(--color-accent-strong)" />
      </svg>
    </div>
  );
}
