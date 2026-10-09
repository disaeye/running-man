"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import type { RecentLoad } from "@features/today/hooks/useCoachContext";

export function HomePmcPulse({
  points,
  fallback,
}: {
  points: readonly PmcPoint[];
  fallback: RecentLoad | null;
}) {
  const current = points.at(-1);
  const weekAgo = points.length >= 8 ? points.at(-8) : points.at(0);
  const deltaCtl = current?.ctl != null && weekAgo?.ctl != null ? current.ctl - weekAgo.ctl : null;
  const deltaText = deltaCtl != null ? `${deltaCtl >= 0 ? "+" : ""}${deltaCtl.toFixed(1)}` : "--";

  const d7Tss = fallback?.d7_tss != null
    ? Math.round(fallback.d7_tss)
    : points.length > 0
      ? Math.round(points.slice(-7).reduce((acc, p) => acc + (p.tss ?? 0), 0))
      : null;

  const tsb = current?.tsb ?? fallback?.current_tsb ?? null;
  const trendStatus = deltaCtl != null
    ? deltaCtl > 1.5
      ? "积极爬升"
      : deltaCtl >= -0.5
        ? "稳定维持"
        : "恢复调整"
    : "--";

  const chartPoints = points.slice(-14);
  const max = Math.max(...chartPoints.map((point) => Math.max(point.ctl, point.atl)), 1);

  return (
    <div
      className="bento-load glass-surface flex flex-col justify-between rounded-2xl border border-border-subtle p-4 sm:p-6"
      aria-labelledby="load-heading"
    >
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 id="load-heading" className="text-caption1 font-medium tracking-wide text-text-muted">
              近14日负荷趋势
            </h2>
            <div className="flex items-center gap-2 text-caption2 text-text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-stand" />
                CTL 体能
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-atl" />
                ATL 疲劳
              </span>
            </div>
          </div>
          <Link
            href="/analysis?tab=load"
            className="focus-ring flex items-center gap-1 text-caption1 font-medium text-text-muted hover:text-text-primary"
          >
            趋势分析
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-4">
          <div className="relative h-28 overflow-hidden rounded-xl border border-border-subtle bg-surface-sunken/60 p-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(171,198,214,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(171,198,214,.1) 1px, transparent 1px)",
                backgroundSize: "20% 33.333%",
              }}
              aria-hidden="true"
            />
            <div className="relative flex h-full items-end gap-1.5">
              {(chartPoints.length ? chartPoints : [{ ctl: 0, atl: 0 }]).map((point, index) => (
                <div
                  key={`${index}-${point.ctl}`}
                  className="flex min-w-0 flex-1 items-end gap-0.5"
                  title={`CTL ${point.ctl.toFixed(1)} / ATL ${point.atl.toFixed(1)}`}
                >
                  <div
                    className="w-1/2 rounded-t-sm bg-stand/80"
                    style={{ height: `${Math.max((point.ctl / max) * 100, 6)}%` }}
                  />
                  <div
                    className="w-1/2 rounded-t-sm bg-atl/70"
                    style={{ height: `${Math.max((point.atl / max) * 100, 6)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
            <PulseStat
              label="7日负荷"
              value={d7Tss != null ? `${d7Tss} TSS` : "--"}
              color="text-accent"
            />
            <PulseStat
              label="7日ΔCTL"
              value={deltaText}
              color={deltaCtl != null && deltaCtl >= 0 ? "text-primary" : "text-amber-500"}
            />
            <PulseStat
              label="状态评估"
              value={trendStatus}
              color={tsb != null && tsb >= 0 ? "text-emerald-500" : "text-text-primary"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PulseStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-overlay/40 p-2.5 transition-transform active:scale-95">
      <span className="block text-caption1 font-medium text-text-muted">{label}</span>
      <span className={`mt-1 block font-mono text-title3 font-bold ${color}`}>{value}</span>
    </div>
  );
}
