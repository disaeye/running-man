"use client";

import { useMemo } from "react";
import { cumulativeDistancesKm } from "@features/activity/lib/gps-simplify";
import { speedToColor } from "@features/activity/components/map/map-data";
import type { TrackSample } from "@features/activity/components/map/map-data";

interface RouteOverlayProps {
  samples: readonly TrackSample[];
  /** 每个样本对应的视图像素坐标 */
  px: readonly { x: number; y: number }[];
  width: number;
  height: number;
  /** 回放头部样本下标 */
  headIdx: number;
  hoverIdx: number | null;
}

const CHUNK = 6;
/** 平均速度低于此值（m/s）判定为停顿段 */
const PAUSE_SPEED = 0.6;

interface Segment {
  key: number;
  points: string;
  color: string;
  endIdx: number;
  paused: boolean;
}

/** 轨迹按配速着色，头部的圆形标记标出回放位置 */
export function RouteOverlay({ samples, px, width, height, headIdx, hoverIdx }: RouteOverlayProps) {
  const { segments, casingPoints, kmMarks, start, finish } = useMemo(
    () => buildOverlay(samples, px),
    [samples, px],
  );

  const head = px[headIdx];
  const hover = hoverIdx != null ? px[hoverIdx] : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-label="跑步轨迹"
    >
      {/* 底层描边，让轨迹在任意底图上可读 */}
      <polyline
        data-testid="gps-track-polyline"
        points={casingPoints}
        fill="none"
        stroke="var(--color-background)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.8"
      />

      {segments.map((seg) => (
        <polyline
          key={seg.key}
          points={seg.points}
          fill="none"
          style={{ stroke: seg.color }}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={seg.endIdx <= headIdx ? (seg.paused ? 0.35 : 1) : 0.18}
        />
      ))}

      {/* 每公里刻度 */}
      {kmMarks.map((mark) => (
        <g key={mark.km}>
          <circle cx={mark.x} cy={mark.y} r="7" fill="var(--color-background)" fillOpacity="0.75" />
          <text
            x={mark.x}
            y={mark.y + 2.6}
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="600"
            fill="var(--color-text-secondary)"
            className="num"
          >
            {mark.km}
          </text>
        </g>
      ))}

      {/* 起点与终点 */}
      {start ? (
        <circle cx={start.x} cy={start.y} r="4.5" fill="var(--color-success)" stroke="var(--color-background)" strokeWidth="1.5" />
      ) : null}
      {finish ? (
        <circle cx={finish.x} cy={finish.y} r="4.5" fill="var(--color-destructive)" stroke="var(--color-background)" strokeWidth="1.5" />
      ) : null}

      {/* 回放头部 */}
      {head ? (
        <>
          <circle cx={head.x} cy={head.y} r="9" fill="var(--color-primary)" fillOpacity="0.25" />
          <circle cx={head.x} cy={head.y} r="4" fill="var(--color-primary)" stroke="var(--color-background)" strokeWidth="1.5" />
        </>
      ) : null}

      {/* 运动流图表悬停联动游标 */}
      {hover ? (
        <circle cx={hover.x} cy={hover.y} r="7" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" />
      ) : null}
    </svg>
  );
}

function buildOverlay(samples: readonly TrackSample[], px: readonly { x: number; y: number }[]) {
  const casingPoints = px.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const speeds = samples.map((s) => s.speed).filter((v): v is number => v != null && v > 0.5);
  const minSpeed = speeds.length ? Math.min(...speeds) : 0;
  const maxSpeed = speeds.length ? Math.max(...speeds) : 0;

  const segments: Segment[] = [];
  for (let i = 0; i < samples.length - 1; i += CHUNK - 1) {
    const end = Math.min(samples.length - 1, i + CHUNK - 1);
    const chunkSpeeds = samples
      .slice(i, end + 1)
      .map((s) => s.speed)
      .filter((v): v is number => v != null && v > 0.5);
    const avg = chunkSpeeds.length
      ? chunkSpeeds.reduce((a, c) => a + c, 0) / chunkSpeeds.length
      : null;
    segments.push({
      key: i,
      points: px.slice(i, end + 1).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      color: speedToColor(avg, minSpeed, maxSpeed),
      endIdx: end,
      paused: avg != null && avg < PAUSE_SPEED,
    });
  }

  return {
    segments,
    casingPoints,
    kmMarks: buildKmMarks(samples, px),
    start: px[0] ?? null,
    finish: px[px.length - 1] ?? null,
  };
}

function buildKmMarks(samples: readonly TrackSample[], px: readonly { x: number; y: number }[]) {
  if (samples.length < 2) return [];
  const cumKm = cumulativeDistancesKm(samples.map((s) => s.point));
  const totalKm = cumKm[cumKm.length - 1] ?? 0;
  const marks: { km: number; x: number; y: number }[] = [];
  let idx = 1;
  for (let km = 1; km < Math.floor(totalKm); km += 1) {
    while (idx < cumKm.length && (cumKm[idx] ?? 0) < km) idx += 1;
    const p = px[idx];
    if (p) marks.push({ km, x: p.x, y: p.y });
  }
  return marks;
}
