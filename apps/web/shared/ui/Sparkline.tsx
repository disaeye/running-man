"use client";

import type { CSSProperties } from "react";

export interface SparklineProps {
  data: number[];
  variant: "area" | "line" | "bar";
  color?: string;
  width?: number | string;
  height?: number | string;
  opacity?: number;
  className?: string;
}

const VB_W = 100;
const VB_H = 40;
const PAD = 1;

type Pt = { x: number; y: number };

function toPoints(data: number[], innerW: number, innerH: number): Pt[] {
  if (data.length === 0) return [];
  if (data.length === 1)
    return [{ x: VB_W / 2, y: PAD + innerH / 2 }];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data.map((v, i) => ({
    x: PAD + (i / (data.length - 1)) * innerW,
    y: PAD + (1 - (v - min) / range) * innerH,
  }));
}

function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0]!.x)},${f(pts[0]!.y)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const cpx = (prev.x + cur.x) / 2;
    d += ` Q${f(cpx)},${f(prev.y)} ${f(cpx)},${f((prev.y + cur.y) / 2)}`;
    if (i === pts.length - 1) d += ` T${f(cur.x)},${f(cur.y)}`;
  }
  return d;
}

function areaPath(lineD: string, pts: Pt[]): string {
  if (pts.length < 2) return "";
  const bot = PAD + VB_H - 2 * PAD;
  return `${lineD} L${pts[pts.length - 1]!.x.toFixed(2)},${bot} L${pts[0]!.x.toFixed(2)},${bot} Z`;
}

function polylineStr(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

export function computeTrendDirection(
  data: number[],
  threshold?: number,
): "up" | "down" | "stable" {
  if (data.length < 2) return "stable";
  const recent = data.slice(-3);
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const diff = last - first;
  const fallback = (Math.max(...data) - Math.min(...data)) * 0.05;
  const eff = threshold ?? (fallback || 1);
  if (Math.abs(diff) <= eff) return "stable";
  return diff > 0 ? "up" : "down";
}

function AreaPath({ pts, color }: { pts: Pt[]; color: string }) {
  if (pts.length === 0) return null;
  if (pts.length === 1) {
    const p = pts[0]!;
    const bot = PAD + VB_H - 2 * PAD;
    return (
      <>
        <path
          d={`M${p.x.toFixed(2)},${p.y.toFixed(2)} L${p.x.toFixed(2)},${bot} Z`}
          fill={color}
          fillOpacity={0.12}
          stroke="none"
        />
        <path
          d={`M${p.x.toFixed(2)},${p.y.toFixed(2)}`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </>
    );
  }
  const lineD = smoothPath(pts);
  if (!lineD) return null;
  return (
    <>
      <path d={areaPath(lineD, pts)} fill={color} fillOpacity={0.12} stroke="none" />
      <path
        d={lineD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function LinePath({ pts, color }: { pts: Pt[]; color: string }) {
  if (pts.length < 2) return null;
  return (
    <polyline
      points={polylineStr(pts)}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Bars({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const innerW = VB_W - 2 * PAD;
  const innerH = VB_H - 2 * PAD;
  const gap = data.length > 1 ? 1 : 0;
  const barW = Math.max(0.5, (innerW - gap * (data.length - 1)) / data.length);
  const bot = PAD + innerH;

  return (
    <>
      {data.map((v, i) => {
        const h = Math.max(0.5, ((v - min) / range) * innerH);
        return (
          <rect
            key={i}
            x={PAD + i * (barW + gap)}
            y={bot - h}
            width={barW}
            height={h}
            fill={color}
            rx={0.5}
          />
        );
      })}
    </>
  );
}

function LastDot({ pts, color }: { pts: Pt[]; color: string }) {
  if (pts.length === 0) return null;
  const p = pts[pts.length - 1]!;
  return <circle cx={p.x} cy={p.y} r={1.2} fill={color} />;
}

export function Sparkline({
  data,
  variant,
  color = "var(--color-chart-accent)",
  width = "100%",
  height = 40,
  opacity = 0.15,
  className,
}: SparklineProps) {
  const innerW = VB_W - 2 * PAD;
  const innerH = VB_H - 2 * PAD;
  const pts = variant !== "bar" ? toPoints(data, innerW, innerH) : [];

  const style: CSSProperties = { width, height, opacity, color };

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      style={style}
      aria-hidden="true"
      className={className}
    >
      {variant === "bar" ? (
        <Bars data={data} color={color} />
      ) : variant === "area" ? (
        <AreaPath pts={pts} color={color} />
      ) : (
        <LinePath pts={pts} color={color} />
      )}
      {variant !== "bar" && pts.length > 0 && <LastDot pts={pts} color={color} />}
    </svg>
  );
}
