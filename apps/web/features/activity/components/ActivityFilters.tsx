"use client";

import { useMemo } from "react";
import { DateRangePicker } from "@shared/ui/DateRangePicker";
import { getSportConfig, isProductSport } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";

type Intensity = "all" | "easy" | "moderate" | "hard" | "unknown";

export interface ActivityFilterState {
  from: string;
  to: string;
  sport: string;
  race?: "all" | "race" | "training";
  intensity: Intensity;
  gpsOnly: boolean;
  source: string;
  /** 名称关键词，空串不过滤 */
  q?: string;
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
  { value: "unknown", label: "强度未知" },
];

export function ActivityFilters({ filters, onChange, activities }: ActivityFiltersProps) {
  // 类型下拉只列产品范围内的运动（跑步家族 + 力量家族）；标签走注册表，
  // 未知类型兑底为「其他运动」。
  const availableActivities = useMemo(
    () => activities.filter((activity) => isProductSport(activity.sport)),
    [activities],
  );

  const sportOptions = useMemo(() => {
    const sports = new Set(availableActivities.map((a) => a.sport));
    return Array.from(sports).sort().map((s) => ({
      value: s,
      label: getSportConfig(s).label,
    }));
  }, [availableActivities]);

  const sourceOptions = useMemo(() => {
    const sources = new Set(
      availableActivities.map((a) => a.source).filter((s): s is string => s != null),
    );
    return Array.from(sources).sort();
  }, [availableActivities]);

  const set = (patch: Partial<ActivityFilterState>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label="搜索训练名称"
        placeholder="搜索名称…"
        value={filters.q ?? ""}
        onChange={(e) => set({ q: e.target.value })}
        className="focus-ring min-h-[44px] min-w-[10rem] flex-1 rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline text-text-primary sm:max-w-56"
      />

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
            {s.label}
          </option>
        ))}
      </select>

      <select
        aria-label="活动分类"
        value={filters.race ?? "all"}
        onChange={(e) => set({ race: e.target.value as ActivityFilterState["race"] })}
        className="focus-ring min-h-[44px] rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline text-text-primary"
      >
        <option value="all">全部训练</option>
        <option value="training">日常训练</option>
        <option value="race">比赛</option>
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
