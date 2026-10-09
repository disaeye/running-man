"use client";

import { useMemo } from "react";
import { DateRangePicker } from "@shared/ui/DateRangePicker";
import { getSportConfig, SPORT_CONFIG } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";

type Intensity = "all" | "easy" | "moderate" | "hard";

export interface ActivityFilterState {
  from: string;
  to: string;
  sport: string;
  intensity: Intensity;
  gpsOnly: boolean;
  source: string;
}

interface ActivityFiltersProps {
  filters: ActivityFilterState;
  onChange: (filters: ActivityFilterState) => void;
  activities: ActivitySummary[];
}

const INTENSITY_OPTIONS: { value: Intensity; label: string }[] = [
  { value: "all", label: "全部强度" },
  { value: "easy", label: "轻松" },
  { value: "moderate", label: "中等" },
  { value: "hard", label: "高强度" },
];

function classifyIntensity(tss: number | null): string {
  if (tss == null) return "easy";
  if (tss < 50) return "easy";
  if (tss < 100) return "moderate";
  return "hard";
}

export function ActivityFilters({ filters, onChange, activities }: ActivityFiltersProps) {
  const sportOptions = useMemo(() => {
    const sports = new Set(activities.map((a) => a.sport));
    return Array.from(sports).sort().map((s) => ({
      value: s,
      label: getSportConfig(s).label,
    }));
  }, [activities]);

  const sourceOptions = useMemo(() => {
    const sources = new Set(
      activities.map((a) => a.source).filter((s): s is string => s != null),
    );
    return Array.from(sources).sort();
  }, [activities]);

  const set = (patch: Partial<ActivityFilterState>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker from={filters.from} to={filters.to} onChange={(from, to) => set({ from, to })} />

      <select
        aria-label="活动类型"
        value={filters.sport}
        onChange={(e) => set({ sport: e.target.value })}
        className="focus-ring min-h-[44px] rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline text-text-primary transition-colors hover:bg-surface-overlay"
      >
        <option value="all">全部类型</option>
        {sportOptions.map((s) => (
          <option key={s.value} value={s.value}>
            {Object.prototype.hasOwnProperty.call(SPORT_CONFIG, s.value) ? s.label : s.value}
          </option>
        ))}
      </select>

      <select
        aria-label="训练强度"
        value={filters.intensity}
        onChange={(e) => set({ intensity: e.target.value as Intensity })}
        className="focus-ring min-h-[44px] rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline text-text-primary transition-colors hover:bg-surface-overlay"
      >
        {INTENSITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => set({ gpsOnly: !filters.gpsOnly })}
        className={`focus-ring min-h-[44px] rounded-lg border px-3 py-2 text-subheadline transition-colors ${
          filters.gpsOnly
            ? "border-accent bg-accent/15 text-accent-strong"
            : "border-border-default bg-surface-card text-text-secondary hover:bg-surface-overlay"
        }`}
      >
        GPS
      </button>

      {sourceOptions.length > 0 && (
        <select
          aria-label="数据来源"
          value={filters.source}
          onChange={(e) => set({ source: e.target.value })}
          className="focus-ring min-h-[44px] rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline text-text-primary transition-colors hover:bg-surface-overlay"
        >
          <option value="all">全部来源</option>
          {sourceOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export { classifyIntensity };
