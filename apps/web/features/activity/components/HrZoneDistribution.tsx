"use client";

import { Card } from "@shared/ui/Card";
import type { HrZones } from "@features/activity/hooks/useActivityAnalysis";

interface HrZoneDistributionProps {
  zones: HrZones | null;
}

interface ZoneEntry {
  key: keyof HrZones;
  label: string;
  range: string;
  bgClass: string;
}

const ZONES: ZoneEntry[] = [
  { key: "z1", label: "Z1", range: "<60% HRmax", bgClass: "bg-zone-1" },
  { key: "z2", label: "Z2", range: "60–70% HRmax", bgClass: "bg-zone-2" },
  { key: "z3", label: "Z3", range: "70–80% HRmax", bgClass: "bg-zone-3" },
  { key: "z4", label: "Z4", range: "80–90% HRmax", bgClass: "bg-zone-4" },
  { key: "z5", label: "Z5", range: ">90% HRmax", bgClass: "bg-zone-5" },
];

function formatTotalTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

function formatZoneTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}h${rem > 0 ? ` ${rem}m` : ""}`;
  }
  return `${m}m`;
}

export function HrZoneDistribution({ zones }: HrZoneDistributionProps) {
  const total = zones ? ZONES.reduce((sum, z) => sum + zones[z.key], 0) : 0;

  if (!zones || total === 0) {
    return (
      <Card padding="sm">
        <h2 className="mb-3 text-subheadline font-semibold text-text-secondary">心率区间分布</h2>
        <p className="text-caption1 text-text-muted">暂无数据</p>
      </Card>
    );
  }

  // Compute stacked bar widths as percent
  const pctMap = new Map<keyof HrZones, number>();
  for (const z of ZONES) {
    pctMap.set(z.key, (zones[z.key] / total) * 100);
  }

  return (
    <Card padding="sm">
      <h2 className="mb-3 text-subheadline font-semibold text-text-secondary">心率区间分布</h2>
      <p className="mb-3 text-caption1 text-text-muted">
        总心率训练时间 {formatTotalTime(total)}，各区间时长分布。
      </p>

      {/* Stacked bar */}
      <div className="mb-4 flex h-4 w-full overflow-hidden rounded-md bg-surface-sunken">
        {ZONES.map((z) => {
          const pct = pctMap.get(z.key) ?? 0;
          if (pct < 0.1) return null;
          return (
            <div
              key={z.key}
              className={`${z.bgClass} h-full transition-all`}
              style={{ width: `${pct}%` }}
              title={`${z.label}: ${formatZoneTime(zones[z.key])}`}
            />
          );
        })}
      </div>

      {/* Legend + detail */}
      <div className="flex flex-col gap-2">
        {ZONES.map((z) => {
          const t = zones[z.key];
          const pct = pctMap.get(z.key) ?? 0;
          return (
            <div key={z.key} className="flex items-center gap-2 text-caption1">
              <span className={`h-3 w-3 shrink-0 rounded-sm ${z.bgClass}`} />
              <span className="w-6 font-semibold text-text-primary">{z.label}</span>
              <span className="w-24 text-text-muted">{z.range}</span>
              <span className="font-mono text-text-secondary">
                {formatZoneTime(t)}
              </span>
              <span className="ml-auto font-mono text-text-muted">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
