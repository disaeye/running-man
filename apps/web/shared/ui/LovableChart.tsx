"use client";

import { useId, useMemo, useState } from "react";

/**
 * 通用折线/柱状图。
 *
 * 所有序列图共用的交互：横轴刻度、指针跟随的竖直虚线与读数。
 * 调用方传 `labels`（每个点的横轴文字，通常是日期）与每条线的
 * `format`，悬停时读数行按图例顺序列出各序列在该点的值。
 */

export interface ChartLine {
  /** null 表示该点未记录：线在此断开，不画成 0。 */
  data: (number | null)[];
  cls: string;
  dashed?: boolean;
  label?: string;
  format?: (value: number) => string;
}

export interface ChartBars {
  data: number[];
  cls: string;
  label?: string;
  format?: (value: number) => string;
}

interface LovableChartProps {
  lines?: ChartLine[];
  bars?: ChartBars;
  h?: number;
  zero?: boolean;
  /** 数值越小越靠上（配速） */
  invertY?: boolean;
  /** 每个点的横轴文字；给了才显示横轴与悬停读数 */
  labels?: readonly string[];
}

const VIEW_W = 320;
const PAD_X = 6;
const PAD_Y = 6;
const TICKS = 5;

export function LovableChart({ lines = [], bars, h = 140, zero = false, invertY = false, labels }: LovableChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const all = [...lines.flatMap((line) => line.data.filter((value): value is number => value != null)), ...(zero ? [0] : [])];
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 1);
  const count = Math.max(lines[0]?.data.length ?? 0, bars?.data.length ?? 0, 1);
  const x = (index: number) => PAD_X + (index / Math.max(1, count - 1)) * (VIEW_W - PAD_X * 2);
  const y = (value: number) => {
    const ratio = (value - min) / (max - min || 1);
    return invertY ? PAD_Y + ratio * (h - PAD_Y * 2) : h - PAD_Y - ratio * (h - PAD_Y * 2);
  };
  const barMax = bars ? Math.max(...bars.data, 1) : 1;

  const series = useMemo(
    () => [
      ...(bars ? [{ kind: "bar" as const, bars }] : []),
      ...lines.map((line) => ({ kind: "line" as const, line })),
    ],
    [bars, lines],
  );

  const readout = useMemo(() => {
    if (hover == null || !labels) return null;
    const entries = series
      .map((item) => {
        const data = item.kind === "bar" ? item.bars.data : item.line.data;
        const label = (item.kind === "bar" ? item.bars.label : item.line.label) ?? "";
        const format = (item.kind === "bar" ? item.bars.format : item.line.format) ?? ((value: number) => value.toFixed(1));
        const value = data[hover];
        if (value == null || !label) return null;
        return { label, text: format(value), cls: item.kind === "bar" ? item.bars.cls : item.line.cls };
      })
      .filter((entry): entry is { label: string; text: string; cls: string } => entry != null);
    return entries.length ? { at: labels[hover] ?? "", entries } : null;
  }, [hover, labels, series]);

  const tickIndexes = useMemo(() => {
    if (!labels || labels.length === 0) return [];
    const step = Math.max(1, Math.ceil(labels.length / TICKS));
    const indexes: number[] = [];
    for (let i = 0; i < labels.length; i += step) indexes.push(i);
    if (indexes[indexes.length - 1] !== labels.length - 1) indexes.push(labels.length - 1);
    return indexes;
  }, [labels]);

  return (
    <div className="space-y-1">
      {readout ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-caption1">
          <span className="text-text-secondary">{readout.at}</span>
          {readout.entries.map((entry) => (
            <span key={entry.label} className="num text-text-secondary">
              <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${entry.cls.replace(/^(stroke|fill|bg)-/, "bg-")}`} />
              {entry.label} {entry.text}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className="relative w-full"
        onPointerMove={(event) => {
          if (!labels || labels.length === 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const xView = Math.min(VIEW_W - PAD_X, Math.max(PAD_X, ((event.clientX - rect.left) / rect.width) * VIEW_W));
          const position = (xView - PAD_X) / (VIEW_W - PAD_X * 2);
          setHover(Math.round(position * (labels.length - 1)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${VIEW_W} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: h }} aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {bars?.data.map((value, index) => <rect key={index} x={x(index) - VIEW_W / count / 2.6} width={VIEW_W / count / 1.3} y={h - (value / barMax) * h * 0.55} height={(value / barMax) * h * 0.55} className={bars.cls} rx={1} />)}
          {zero && min < 0 ? <line x1={0} x2={VIEW_W} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} /> : null}
          {lines.map((line, index) => {
            // 连续段：null 处断开，未记录的点不画成 0。
            const runs: string[][] = [];
            let current: string[] = [];
            for (let point = 0; point < line.data.length; point++) {
              const value = line.data[point];
              if (value == null) {
                if (current.length > 1) runs.push(current);
                current = [];
                continue;
              }
              current.push(`${x(point)},${y(value)}`);
            }
            if (current.length > 1) runs.push(current);
            return runs.map((points, runIndex) => (
              <polyline key={`${index}-${runIndex}`} fill="none" strokeWidth={2} strokeLinejoin="round" strokeDasharray={line.dashed ? "4 4" : undefined} className={line.cls} points={points.join(" ")} vectorEffect="non-scaling-stroke" />
            ));
          })}
          {hover != null && count > 1 ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} stroke="var(--color-text-secondary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} vectorEffect="non-scaling-stroke" />
              {lines.map((line, index) =>
                line.data[hover] != null ? <circle key={index} cx={x(hover)} cy={y(line.data[hover]!)} r={2.5} className={line.cls.replace(/^stroke-/, "fill-")} /> : null,
              )}
            </g>
          ) : null}
        </svg>
      </div>
      {labels && labels.length > 0 ? (
        <div className="flex justify-between text-caption2 text-text-muted">
          {tickIndexes.map((index) => (
            <span key={index} className="num">{labels[index]}</span>
          ))}
        </div>
      ) : null}
      {/* 文本摘要层：SVG 对读屏与键盘不可达（aria-hidden），这里给每条线
       * 的首尾值与最显著拐点一个文本替代，PMC/ACWR/EF 的核心读数不依赖悬停。 */}
      {lines.some((line) => line.label != null) ? (
        <dl className="sr-only" aria-label="图表数据摘要">
          {lines.map((line, index) => {
            const defined = line.data.filter((v): v is number => v != null);
            if (!line.label || defined.length === 0) return null;
            const format = line.format ?? ((value: number) => value.toFixed(1));
            // 拐点：相邻差值序列里方向反转的局部极值中，前后幅差最大的那个；
            // 单调序列无拐点，不提。
            let turning = "";
            if (defined.length >= 3) {
              let best = -1;
              let bestSwing = 0;
              for (let i = 1; i < defined.length - 1; i++) {
                const prevDelta = defined[i]! - defined[i - 1]!;
                const nextDelta = defined[i + 1]! - defined[i]!;
                const swing = Math.abs(prevDelta) + Math.abs(nextDelta);
                if (
                  ((prevDelta > 0 && nextDelta < 0) || (prevDelta < 0 && nextDelta > 0))
                  && swing > bestSwing
                ) {
                  bestSwing = swing;
                  best = i;
                }
              }
              if (best > 0) {
                const at = labels && labels.length === line.data.length ? labels[best] ?? "" : "";
                turning = `，拐点${at ? ` ${at} 处` : ""} ${format(defined[best]!)}`;
              }
            }
            return (
              <div key={`${line.label}-${index}`}>
                <dt>{line.label}</dt>
                <dd>
                  起点 {format(defined[0]!)}，终点 {format(defined[defined.length - 1]!)}，
                  共 {defined.length} 个数据点{turning}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </div>
  );
}

export function LovableLegend({ items }: { items: { label: string; cls: string }[] }) {
  return <div className="mt-2 flex flex-wrap gap-3 text-caption1 text-muted-foreground">{items.map((item) => <span key={item.label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${item.cls}`} />{item.label}</span>)}</div>;
}
