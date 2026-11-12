"use client";

import { useId, useMemo } from "react";
import { valueAt, type TimeDomain, type TimePoint } from "@features/activity/lib/stream-series";

export interface StreamMiniChartProps {
  title: string;
  unit: string;
  points: readonly TimePoint[];
  domain: TimeDomain;
  color: string;
  /** 配速：数值越小越快，纵轴要反过来 */
  invertY?: boolean;
  formatValue: (value: number) => string;
  hoverTimeSec: number | null;
  onHoverTime: (timeSec: number | null) => void;
  testId?: string;
}

const VIEW_W = 600;
const VIEW_H = 76;
const PAD_X = 8;
const PAD_Y = 8;

/** 单条流的折线图：纵向虚线游标跟随指针，读数写在标题行 */
export function StreamMiniChart({
  title,
  unit,
  points,
  domain,
  color,
  invertY = false,
  formatValue,
  hoverTimeSec,
  onHoverTime,
  testId,
}: StreamMiniChartProps) {
  const gradientId = useId();

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const span = domain.end - domain.start;
    const toX = (timeSec: number) => PAD_X + ((timeSec - domain.start) / span) * (VIEW_W - PAD_X * 2);
    const toY = (value: number) => {
      const ratio = (value - min) / range;
      return invertY
        ? PAD_Y + ratio * (VIEW_H - PAD_Y * 2)
        : VIEW_H - PAD_Y - ratio * (VIEW_H - PAD_Y * 2);
    };
    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.timeSec).toFixed(1)} ${toY(p.value).toFixed(1)}`)
      .join(" ");
    const baseline = invertY ? PAD_Y : VIEW_H - PAD_Y;
    return {
      line,
      area: `${line} L ${toX(points[points.length - 1]!.timeSec).toFixed(1)} ${baseline} L ${toX(points[0]!.timeSec).toFixed(1)} ${baseline} Z`,
      toX,
      toY,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
    };
  }, [points, domain, invertY]);

  if (!geometry) {
    return (
      <div className="space-y-1">
        <Header title={title} unit={unit} value={null} formatValue={formatValue} />
        <div className="flex h-[76px] items-center justify-center rounded-lg bg-secondary/40 text-caption1 text-muted-foreground">
          暂无{title}数据
        </div>
      </div>
    );
  }

  const hoverValue = hoverTimeSec != null ? valueAt(points, hoverTimeSec) : null;
  const hoverPoint =
    hoverTimeSec != null && hoverValue != null
      ? { x: geometry.toX(hoverTimeSec), y: geometry.toY(hoverValue) }
      : null;

  return (
    <div className="space-y-1" data-testid={testId}>
      <Header
        title={title}
        unit={unit}
        value={hoverValue ?? geometry.average}
        prefix={hoverValue != null ? "" : "均 "}
        formatValue={formatValue}
      />
      <div
        className={`relative h-[76px] w-full overflow-hidden rounded-lg bg-secondary/40 ${hoverPoint ? "cursor-crosshair" : ""}`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
          // 换到 viewBox 坐标，再按绘图区宽度反推时间，preserveAspectRatio=none 下比例不变
          const xView = Math.min(VIEW_W - PAD_X, Math.max(PAD_X, ratio * VIEW_W));
          const position = (xView - PAD_X) / (VIEW_W - PAD_X * 2);
          onHoverTime(domain.start + position * (domain.end - domain.start));
        }}
        onPointerLeave={() => onHoverTime(null)}
      >
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path
            d={geometry.line}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {hoverPoint ? (
            <>
              <line
                x1={hoverPoint.x}
                y1={PAD_Y}
                x2={hoverPoint.x}
                y2={VIEW_H - PAD_Y}
                stroke="var(--color-text-secondary)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.7"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={hoverPoint.x} cy={hoverPoint.y} r="2.5" fill={color} vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

function Header({
  title,
  unit,
  value,
  prefix = "",
  formatValue,
}: {
  title: string;
  unit: string;
  value: number | null;
  prefix?: string;
  formatValue: (value: number) => string;
}) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="font-medium text-text-secondary">{title}</span>
      <span className="num text-caption1 text-muted-foreground">
        {value != null ? `${prefix}${formatValue(value)} ${unit}` : "--"}
      </span>
    </div>
  );
}
