"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChartDataSummary } from "@shared/ui/ChartDataSummary";
import { ChartAxisTicks } from "@shared/ui/ChartAxisTicks";
import { LovableLegend } from "@shared/ui/LovableLegend";
export { LovableLegend };
import {
  annotationToneClasses,
  buildChartReadout,
  buildChartSummaryItems,
  buildLineRuns,
  computeChartScale,
  computeTickIndexes,
  chartIndexFromPointer,
  type ChartAnnotation,
} from "@shared/ui/lovable-chart-helpers";

export type { ChartAnnotation };

export interface ChartLine {
  /** null 表示该点未记录：线在此断开，不画成 0。 */
  data: (number | null)[];
  cls: string;
  dashed?: boolean;
  dotted?: boolean;
  label?: string;
  format?: (value: number) => string;
}

export interface ChartBars {
  data: number[];
  cls: string;
  label?: string;
  format?: (value: number) => string;
}

export interface ReferenceBand {
  readonly min: number;
  readonly max: number;
  readonly label?: string;
}

interface LovableChartProps {
  lines?: ChartLine[];
  bars?: ChartBars;
  h?: number;
  zero?: boolean;
  invertY?: boolean;
  labels?: readonly string[];
  referenceBand?: ReferenceBand;
  annotations?: readonly ChartAnnotation[];
  provenance?: string;
  emptyMessage?: string;
}

const VIEW_W = 320;
const PAD_X = 28;
const PAD_Y = 8;
const TICKS = 5;

export function LovableChart({
  lines = [],
  bars,
  h = 140,
  zero = false,
  invertY = false,
  labels,
  referenceBand,
  annotations,
  provenance,
  emptyMessage = "该时间范围暂无数据",
}: LovableChartProps) {
  const [preview, setPreview] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const hover = preview ?? selected;
  const { hasValues, min, max, barMax, count } = useMemo(
    () => computeChartScale({ lines, bars, labels, referenceBand, zero }),
    [lines, bars, labels, referenceBand, zero],
  );
  const x = (index: number) => PAD_X + (index / Math.max(1, count - 1)) * (VIEW_W - PAD_X * 2);
  const y = (value: number) => {
    const ratio = (value - min) / (max - min || 1);
    return invertY ? PAD_Y + ratio * (h - PAD_Y * 2) : h - PAD_Y - ratio * (h - PAD_Y * 2);
  };

  const readout = useMemo(
    () => buildChartReadout({ hover, labels, lines, bars, invertY }),
    [hover, labels, lines, bars, invertY],
  );
  const visibleAnnotations = useMemo(
    () => (annotations ?? []).filter((ann) => ann.index >= 0 && ann.index < count),
    [annotations, count],
  );
  const activeAnnotation = hover != null ? visibleAnnotations.find((ann) => ann.index === hover) ?? null : null;
  const tickIndexes = useMemo(() => computeTickIndexes(labels, TICKS), [labels]);
  const summaryItems = useMemo(() => buildChartSummaryItems(lines, labels), [lines, labels]);

  if (!hasValues) {
    return (
      <div style={{ height: h }} className="flex items-center justify-center rounded-xl bg-surface-overlay/50 text-caption1 text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  const bandTop = referenceBand ? Math.min(y(referenceBand.max), y(referenceBand.min)) : 0;
  const bandBottom = referenceBand ? Math.max(y(referenceBand.max), y(referenceBand.min)) : 0;

  function updateHoverFromPointer(clientX: number, rect: DOMRect) {
    setPreview(chartIndexFromPointer(clientX, rect, labels?.length ?? 0, VIEW_W, PAD_X));
  }

  return (
    <div className="space-y-1.5">
      {labels && labels.length > 0 ? (
        <div className="flex min-h-5 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-caption1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            {readout ? (
              <>
                <span className="num text-text-muted">{readout.at}</span>
                {readout.entries.map((entry) => (
                  <span key={entry.label} className="num text-text-primary">
                    <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${entry.cls.replace(/^(stroke|fill|bg)-/, "bg-")}`} />
                    {entry.label} {entry.text}
                    {entry.deltaText ? <span className="ml-1 text-text-muted">({entry.deltaText})</span> : null}
                  </span>
                ))}
                {activeAnnotation ? (
                  <span className={`font-medium ${annotationToneClasses(activeAnnotation.tone).badge}`}>
                    {activeAnnotation.label}{activeAnnotation.detail ? ` · ${activeAnnotation.detail}` : ""}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-text-muted" aria-hidden="true" />
            )}
          </div>
          {referenceBand?.label ? <span className="text-caption1 text-success">{referenceBand.label}</span> : null}
        </div>
      ) : null}
      <div
        className="relative w-full"
        onPointerMove={(event) => {
          if (event.pointerType !== "touch") updateHoverFromPointer(event.clientX, event.currentTarget.getBoundingClientRect());
        }}
        onClick={(event) => {
          const index = chartIndexFromPointer(event.clientX, event.currentTarget.getBoundingClientRect(), labels?.length ?? 0, VIEW_W, PAD_X);
          setSelected((current) => current === index ? null : index);
          setPreview(null);
        }}
        onPointerLeave={() => setPreview(null)}
      >
        <svg viewBox={`0 0 ${VIEW_W} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: h }} aria-hidden="true">
          <ChartAxisTicks min={min} max={max} top={PAD_Y} bottom={h - PAD_Y} left={PAD_X} right={VIEW_W - PAD_X} />
          {referenceBand ? (
            <g>
              <rect x={PAD_X} width={VIEW_W - PAD_X * 2} y={bandTop} height={Math.max(1, bandBottom - bandTop)} className="fill-success/12" />
              <line x1={PAD_X} x2={VIEW_W - PAD_X} y1={bandTop} y2={bandTop} className="stroke-success/35" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
              <line x1={PAD_X} x2={VIEW_W - PAD_X} y1={bandBottom} y2={bandBottom} className="stroke-success/35" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            </g>
          ) : null}
          {bars?.data.map((value, index) => (
            <rect
              key={index}
              x={x(index) - VIEW_W / count / 2.6}
              width={VIEW_W / count / 1.3}
              y={h - (value / barMax) * h * 0.55}
              height={(value / barMax) * h * 0.55}
              className={bars.cls}
              rx={1}
            />
          ))}
          {zero && min < 0 ? <line x1={PAD_X} x2={VIEW_W - PAD_X} y1={y(0)} y2={y(0)} className="stroke-text-secondary" strokeWidth={1} opacity={0.55} vectorEffect="non-scaling-stroke" /> : null}
          {visibleAnnotations.map((ann) => {
            const toneCls = annotationToneClasses(ann.tone);
            return (
              <g key={`${ann.index}-${ann.label}`}>
                <line x1={x(ann.index)} x2={x(ann.index)} y1={PAD_Y} y2={h - PAD_Y} className={toneCls.stroke} strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
                <circle cx={x(ann.index)} cy={PAD_Y + 2} r={2.5} className={toneCls.fill} />
              </g>
            );
          })}
          {lines.map((line, index) =>
            buildLineRuns(line.data, x, y).map((points, runIndex) => (
              <polyline
                key={`${index}-${runIndex}`}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeDasharray={line.dotted ? "1 4" : line.dashed ? "4 4" : undefined}
                className={line.cls}
                points={points.join(" ")}
                vectorEffect="non-scaling-stroke"
              />
            )),
          )}
          {hover != null && count > 1 ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} stroke="var(--color-text-secondary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} vectorEffect="non-scaling-stroke" />
              {lines.map((line, index) =>
                line.data[hover] != null ? (
                  <circle key={index} cx={x(hover)} cy={y(line.data[hover]!)} r={2.5} className={line.cls.replace(/^stroke-/, "fill-")} />
                ) : null,
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
      {visibleAnnotations.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5" data-testid="chart-annotations">
          {visibleAnnotations.slice(0, 3).map((ann) => {
            const toneCls = annotationToneClasses(ann.tone);
            const inner = (
              <>
                <span className={`size-1.5 shrink-0 rounded-full ${toneCls.dot}`} aria-hidden="true" />
                <span className="font-medium text-text-primary">{ann.label}</span>
                {labels?.[ann.index] ? <span className="num text-text-muted">{labels[ann.index]}</span> : null}
                {ann.detail ? <span className="truncate text-text-secondary">{ann.detail}</span> : null}
              </>
            );
            return ann.href ? (
              <Link
                key={`${ann.index}-${ann.label}`}
                href={ann.href}
                className="focus-ring inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-surface-overlay px-2.5 text-caption1 transition-colors hover:bg-surface-active"
              >
                {inner}
              </Link>
            ) : (
              <span
                key={`${ann.index}-${ann.label}`}
                className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-border-subtle bg-surface-overlay px-2.5 text-caption1"
              >
                {inner}
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {provenance ? <p className="text-caption1 text-text-muted">{provenance}</p> : <span />}
        {summaryItems.length > 0 ? <ChartDataSummary items={summaryItems} /> : null}
      </div>
    </div>
  );
}


