"use client";

import { useMemo } from "react";
import { formatPaceFromSeconds } from "@shared/lib/format";
import type { TrackSample } from "@features/activity/components/map/map-data";

interface TrackMetersProps {
  samples: readonly TrackSample[];
  /** 已回放到第几个样本 */
  headIdx: number;
  /** 图表悬停样本下标，优先于回放头部 */
  hoverIdx: number | null;
}

const VIEW_W = 100;
const VIEW_H = 44;

const METERS = [
  { key: "pace", label: "配速", unit: "/km", color: "var(--color-primary)" },
  { key: "hr", label: "心率", unit: "bpm", color: "var(--color-destructive)" },
] as const;

/**
 * 路线卡片右侧的两条折线：随回放进度生长，读数是当前时刻的值。
 *
 * 横轴固定成整条路线的时间跨度，所以两条线的形状与轨迹位置一一对应，
 * 头部始终停在当前回放点。
 */
export function TrackMeters({ samples, headIdx, hoverIdx }: TrackMetersProps) {
  const series = useMemo(() => {
    const pace = samples.map((s) => (s.speed != null && s.speed > 0.5 ? 1000 / s.speed : null));
    const hr = samples.map((s) => (s.hr != null && s.hr > 30 ? s.hr : null));
    return { pace: smooth(pace, 5), hr: smooth(hr, 3) };
  }, [samples]);

  const activeIdx = hoverIdx ?? headIdx;

  return (
    <div className="flex shrink-0 gap-2 sm:w-[132px] sm:flex-col" data-testid="track-meters">
      {METERS.map((meter) => (
        <Meter
          key={meter.key}
          label={meter.label}
          unit={meter.unit}
          color={meter.color}
          values={series[meter.key]}
          headIdx={headIdx}
          activeIdx={activeIdx}
          format={(value) =>
            meter.key === "pace" ? formatPaceFromSeconds(Math.round(value)) : String(Math.round(value))
          }
        />
      ))}
    </div>
  );
}

function Meter({
  label,
  unit,
  color,
  values,
  headIdx,
  activeIdx,
  format,
}: {
  label: string;
  unit: string;
  color: string;
  values: readonly (number | null)[];
  headIdx: number;
  activeIdx: number;
  format: (value: number) => string;
}) {
  const domain = useMemo(() => {
    const present = values.filter((v): v is number => v != null);
    if (present.length === 0) return null;
    const min = Math.min(...present);
    const max = Math.max(...present);
    const pad = (max - min) * 0.15 || 1;
    return { min: min - pad, max: max + pad };
  }, [values]);

  const path = useMemo(() => {
    if (!domain) return "";
    const parts: string[] = [];
    for (let i = 0; i <= headIdx && i < values.length; i += 1) {
      const value = values[i];
      if (value == null) continue;
      const x = (i / Math.max(1, values.length - 1)) * VIEW_W;
      const y = VIEW_H - ((value - domain.min) / (domain.max - domain.min)) * VIEW_H;
      parts.push(`${parts.length === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return parts.join(" ");
  }, [values, domain, headIdx]);

  const current = values[activeIdx] ?? null;
  const headPoint = headPointOf(values, domain, headIdx);

  return (
    <div className="min-w-0 flex-1 rounded-xl bg-background/60 p-2 backdrop-blur-sm">
      <div className="flex items-baseline justify-between text-caption2 text-muted-foreground">
        <span>{label}</span>
        <span className="num text-caption1 text-text-primary">
          {current != null ? format(current) : "--"}
        </span>
      </div>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="mt-1 h-10 w-full" preserveAspectRatio="none" aria-label={`${label}曲线`}>
        <path d={path} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {headPoint ? <circle cx={headPoint.x} cy={headPoint.y} r="1.6" fill={color} vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <div className="text-right text-caption2 text-muted-foreground">{unit}</div>
    </div>
  );
}

/** 回放头部对应的点：向上找最近一个有值的样本 */
function headPointOf(
  values: readonly (number | null)[],
  domain: { min: number; max: number } | null,
  headIdx: number,
): { x: number; y: number } | null {
  if (!domain) return null;
  for (let i = Math.min(headIdx, values.length - 1); i >= 0; i -= 1) {
    const value = values[i];
    if (value == null) continue;
    return {
      x: (i / Math.max(1, values.length - 1)) * VIEW_W,
      y: VIEW_H - ((value - domain.min) / (domain.max - domain.min)) * VIEW_H,
    };
  }
  return null;
}

/** 滑动平均，窗口内只统计有值的样本；配速原始值噪声大，需要压一下 */
function smooth(values: readonly (number | null)[], window: number): (number | null)[] {
  if (window <= 1) return [...values];
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j += 1) {
      const value = values[j];
      if (value == null) continue;
      sum += value;
      count += 1;
    }
    out.push(count > 0 ? sum / count : null);
  }
  return out;
}
