"use client";

import { Card } from "@shared/ui/Card";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatHeartRate,
  formatPower,
  formatElevation,
} from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";
import {
  getSportConfig,
  type StatField,
  type SportConfig,
} from "@shared/config/sport-config";
import { termLabel } from "@shared/config/terms";

interface Stat {
  label: string;
  value: string;
  /** 0–100 optional bar for relative magnitude */
  fill?: number | null;
}

interface StatRenderer {
  label: string | ((config: SportConfig) => string);
  render: (activity: ActivitySummary) => string;
  fill?: (activity: ActivitySummary) => number | null;
}

function fmtNum(v: number | null, unit: string): string {
  if (v == null) return "--";
  return `${Math.round(v)} ${unit}`.trim();
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

const statRenderers: Record<StatField, StatRenderer> = {
  distance: {
    label: "距离",
    render: (a) => formatDistance(a.distance_m),
    fill: (a) =>
      a.distance_m != null ? clampPct((a.distance_m / 20000) * 100) : null,
  },
  duration: {
    label: "时长",
    render: (a) => formatDuration(a.duration_s),
    fill: (a) =>
      a.duration_s != null ? clampPct((a.duration_s / 7200) * 100) : null,
  },
  avgHr: {
    label: "平均心率",
    render: (a) => formatHeartRate(a.avg_hr),
    fill: (a) =>
      a.avg_hr != null && a.max_hr
        ? clampPct((a.avg_hr / a.max_hr) * 100)
        : a.avg_hr != null
          ? clampPct((a.avg_hr / 190) * 100)
          : null,
  },
  maxHr: {
    label: "最大心率",
    render: (a) => formatHeartRate(a.max_hr),
    fill: (a) => (a.max_hr != null ? clampPct((a.max_hr / 200) * 100) : null),
  },
  pace: {
    label: "平均配速",
    render: (a) => formatPace(a.avg_speed),
    fill: (a) =>
      a.avg_speed != null && a.avg_speed > 0
        ? clampPct((a.avg_speed / 5) * 100)
        : null,
  },
  avgPower: {
    label: "平均功率",
    render: (a) => formatPower(a.avg_power),
    fill: (a) =>
      a.avg_power != null ? clampPct((a.avg_power / 350) * 100) : null,
  },
  np: {
    label: termLabel("NP"),
    render: (a) => formatPower(a.np),
    fill: (a) => (a.np != null ? clampPct((a.np / 350) * 100) : null),
  },
  tss: {
    label: "TSS",
    render: (a) => fmtNum(a.tss, ""),
    fill: (a) => (a.tss != null ? clampPct((a.tss / 250) * 100) : null),
  },
  cadence: {
    label: (c) => c.cadenceLabel,
    render: (a) => fmtNum(a.avg_cadence, ""),
    fill: (a) =>
      a.avg_cadence != null ? clampPct((a.avg_cadence / 200) * 100) : null,
  },
  elevation: {
    label: "累计爬升",
    render: (a) => formatElevation(a.elevation_gain_m),
    fill: (a) =>
      a.elevation_gain_m != null
        ? clampPct((a.elevation_gain_m / 500) * 100)
        : null,
  },
};

export function StatsPanel({ activity }: { activity: ActivitySummary }) {
  const config = getSportConfig(activity.sport);

  const stats: Stat[] = config.statsConfig.map((key) => {
    const r = statRenderers[key];
    const label = typeof r.label === "function" ? r.label(config) : r.label;
    return {
      label,
      value: r.render(activity),
      fill: r.fill?.(activity) ?? null,
    };
  });

  return (
    <Card padding="md" data-testid="activity-stats-panel">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-surface-overlay/55 px-3 py-3 text-left"
          >
            <p className="truncate text-caption1 font-medium text-text-muted">
              {s.label}
            </p>
            <p className="truncate font-mono text-headline font-semibold tabular-nums text-text-primary">
              {s.value}
            </p>
            {s.fill != null ? (
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-accent/80"
                  style={{ width: `${s.fill}%` }}
                />
              </div>
            ) : (
              <div className="mt-0.5 h-1" aria-hidden />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
