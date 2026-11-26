"use client";

import { useId } from "react";

interface MiniSparklineProps {
  readonly values: readonly (number | null | undefined)[];
  readonly strokeColor: string;
  readonly width?: number;
  readonly height?: number;
  readonly className?: string;
}

/**
 * 迷你趋势线（Sparkline）：
 * 用于 KPI 数据卡内部，在不增加行高的前提下呈现近 N 日变化走势与末端脉冲点。
 */
export function MiniSparkline({
  values,
  strokeColor,
  width = 88,
  height = 24,
  className = "",
}: MiniSparklineProps) {
  const gradId = useId();
  const valid = values
    .map((v, i) => ({ v, i }))
    .filter((item): item is { v: number; i: number } => item.v != null && Number.isFinite(item.v));

  if (valid.length < 2) {
    return (
      <div
        aria-hidden="true"
        className={`h-6 w-full rounded bg-surface-sunken/35 ${className}`}
      />
    );
  }

  const nums = valid.map((d) => d.v);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const padY = 3;
  const padX = 2;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const maxIdx = Math.max(1, values.length - 1);

  const coords = valid.map(({ v, i }) => {
    const x = padX + (i / maxIdx) * innerW;
    const y = padY + innerH - ((v - min) / span) * innerH;
    return { x: +x.toFixed(1), y: +y.toFixed(1) };
  });

  const linePath = coords.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const areaPath = `${linePath} L${last.x} ${height} L${first.x} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`h-6 w-full overflow-visible ${className}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last.x} cy={last.y} r="2.2" fill={strokeColor} />
    </svg>
  );
}
