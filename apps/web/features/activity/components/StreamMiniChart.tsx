"use client";

import { useId, useMemo, useRef } from "react";
import { valueAt } from "@features/activity/lib/stream-series";
import { buildStreamGeometry, STREAM_PAD_X, STREAM_PAD_Y, STREAM_VIEW_H, STREAM_VIEW_W } from "@features/activity/lib/stream-chart-geometry";
import { clampStreamRatio, streamGesture, type StreamGesture } from "@features/activity/lib/stream-gesture";
import { NO_VALUE } from "@shared/lib/use-data-state";

export interface StreamMiniChartProps {
  title: string;
  unit: string;
  points: Parameters<typeof buildStreamGeometry>[0];
  domain: Parameters<typeof buildStreamGeometry>[1];
  color: string;
  invertY?: boolean;
  formatValue: (value: number) => string;
  hoverTimeSec: number | null;
  onHoverTime: (timeSec: number | null, source: "mouse" | "selection") => void;
  testId?: string;
}

interface GestureState {
  pointerId: number;
  startX: number;
  startY: number;
  mode: StreamGesture;
  moved: boolean;
}

export function StreamMiniChart(props: StreamMiniChartProps) {
  const { title, unit, points, domain, color, invertY = false, formatValue, hoverTimeSec, onHoverTime, testId } = props;
  const gradientId = useId();
  const gesture = useRef<GestureState | null>(null);
  const inputSource = useRef<"mouse" | "touch" | null>(null);
  const geometry = useMemo(() => buildStreamGeometry(points, domain, invertY), [points, domain, invertY]);

  if (!geometry) {
    return (
      <div className="space-y-1" data-testid={testId}>
        <Header title={title} unit={unit} value={null} formatValue={formatValue} />
        <div className="flex h-[76px] items-center justify-center border-t border-border-subtle text-caption1 text-muted-foreground">暂无{title}数据</div>
      </div>
    );
  }

  const hoverValue = hoverTimeSec != null ? valueAt(geometry.visiblePoints, hoverTimeSec) : null;
  const hoverPoint = hoverTimeSec != null && hoverValue != null ? { x: geometry.toX(hoverTimeSec), y: geometry.toY(hoverValue) } : null;

  function updateAt(clientX: number, element: HTMLElement, eventSource: "mouse" | "selection") {
    const rect = element.getBoundingClientRect();
    const ratio = clampStreamRatio(clientX, rect.left, rect.width);
    const position = (ratio * STREAM_VIEW_W - STREAM_PAD_X) / (STREAM_VIEW_W - STREAM_PAD_X * 2);
    onHoverTime(domain.start + Math.min(1, Math.max(0, position)) * (domain.end - domain.start), eventSource);
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    inputSource.current = "touch";
    gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, mode: "pending", moved: false };
    if (hoverTimeSec == null) updateAt(event.clientX, event.currentTarget, "selection");
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") {
      inputSource.current = "mouse";
      updateAt(event.clientX, event.currentTarget, "mouse");
      return;
    }
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    active.mode = streamGesture(dx, dy, active.mode);
    active.moved ||= Math.max(Math.abs(dx), Math.abs(dy)) >= 8;
    if (active.mode === "reading") updateAt(event.clientX, event.currentTarget, "selection");
  }

  function pointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
  }

  return (
    <div className="space-y-1" data-testid={testId}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><Header title={title} unit={unit} value={hoverValue ?? geometry.average} prefix={hoverValue != null ? "" : "均 "} formatValue={formatValue} /></div>
        {hoverTimeSec != null ? <button type="button" aria-label={`关闭${title}选定读数`} onClick={() => onHoverTime(null, "selection")} className="min-h-11 min-w-11 text-caption1 text-text-secondary">关闭</button> : null}
      </div>
      <div
        className={`relative h-[76px] w-full touch-pan-y overflow-hidden border-t border-border-subtle ${hoverPoint ? "cursor-crosshair" : ""}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={() => { gesture.current = null; }}
        onPointerLeave={(event) => { if (event.pointerType !== "touch" && inputSource.current === "mouse") { inputSource.current = null; onHoverTime(null, "mouse"); } }}
      >
        <svg viewBox={`0 0 ${STREAM_VIEW_W} ${STREAM_VIEW_H}`} className="h-full w-full" preserveAspectRatio="none">
          <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.18} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path d={geometry.line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hoverPoint ? (
            <>
              <line x1={hoverPoint.x} y1={STREAM_PAD_Y} x2={hoverPoint.x} y2={STREAM_VIEW_H - STREAM_PAD_Y} stroke="var(--color-accent-strong)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" vectorEffect="non-scaling-stroke" />
              <circle cx={hoverPoint.x} cy={hoverPoint.y} r="3" fill="var(--color-accent)" stroke="var(--color-surface-card)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
        </svg>
        {hoverTimeSec != null ? <span className="sr-only" aria-live="polite">已选定{title}时刻，使用关闭按钮返回平均值</span> : null}
      </div>
    </div>
  );
}

function Header({ title, unit, value, prefix = "", formatValue }: {
  title: string;
  unit: string;
  value: number | null;
  prefix?: string;
  formatValue: (value: number) => string;
}) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="font-medium text-text-secondary">{title}</span>
      <span className="num text-caption1 text-muted-foreground">{value != null ? `${prefix}${formatValue(value)} ${unit}` : NO_VALUE}</span>
    </div>
  );
}
