"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
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
  onReset?: () => void;
  activities: ActivitySummary[];
  /** 下拉列出的类型：账户数据里实际存在的产品范围类型，注册表顺序。 */
  readonly sports: readonly string[];
}

export const INTENSITY_LABELS: Record<Intensity, string> = {
  all: "全部强度",
  easy: "轻松",
  moderate: "中等",
  hard: "高强度",
  unknown: "强度未知",
};

const INTENSITY_OPTIONS: { value: Intensity; label: string }[] = [
  { value: "all", label: INTENSITY_LABELS.all },
  { value: "easy", label: INTENSITY_LABELS.easy },
  { value: "moderate", label: INTENSITY_LABELS.moderate },
  { value: "hard", label: INTENSITY_LABELS.hard },
  { value: "unknown", label: INTENSITY_LABELS.unknown },
];

export function countActiveActivityFilters(filters: ActivityFilterState): number {
  let count = 0;
  if (filters.sport !== "all") count += 1;
  if (filters.race && filters.race !== "all") count += 1;
  if (filters.intensity !== "all") count += 1;
  if (filters.gpsOnly) count += 1;
  if (filters.source !== "all") count += 1;
  if (filters.q?.trim()) count += 1;
  return count;
}

export function ActivityFilters({ filters, onChange, onReset, activities, sports }: ActivityFiltersProps) {
  const [searchText, setSearchText] = useState(filters.q ?? "");
  const [prevQ, setPrevQ] = useState(filters.q ?? "");
  if ((filters.q ?? "") !== prevQ) {
    setPrevQ(filters.q ?? "");
    setSearchText(filters.q ?? "");
  }
  const composingRef = useRef(false);
  const filtersRef = useRef(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    if (composingRef.current) return;
    if ((filtersRef.current.q ?? "") === searchText) return;
    const timer = setTimeout(() => {
      onChange({ ...filtersRef.current, q: searchText });
    }, 220);
    return () => clearTimeout(timer);
  }, [searchText, onChange]);

  const availableActivities = useMemo(
    () => activities.filter((activity) => isProductSport(activity.sport)),
    [activities],
  );

  const sourceOptions = useMemo(() => {
    const sources = new Set(
      availableActivities.map((a) => a.source).filter((s): s is string => s != null),
    );
    return Array.from(sources).sort();
  }, [availableActivities]);

  const set = (patch: Partial<ActivityFilterState>) =>
    onChange({ ...filters, ...patch });

  const activeCount = countActiveActivityFilters(filters);
  const secondaryCount =
    (filters.race && filters.race !== "all" ? 1 : 0) +
    (filters.source !== "all" ? 1 : 0);
  const [moreOpen, setMoreOpen] = useState(secondaryCount > 0);
  const showMore = moreOpen || secondaryCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label="搜索训练名称"
        placeholder="搜索名称…"
        value={searchText}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          setSearchText(e.currentTarget.value);
        }}
        onChange={(e) => setSearchText(e.target.value)}
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
        {sports.map((key) => (
          <option key={key} value={key}>
            {getSportConfig(key).label}
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
        aria-pressed={filters.gpsOnly}
        title="仅显示含 GPS 轨迹的活动"
        onClick={() => set({ gpsOnly: !filters.gpsOnly })}
        className={`focus-ring min-h-[44px] rounded-lg border px-3 py-2 text-subheadline transition-colors ${
          filters.gpsOnly
            ? "border-accent bg-accent/15 text-accent-strong"
            : "border-border-default bg-surface-card text-text-secondary hover:bg-surface-overlay"
        }`}
      >
        GPS
      </button>

      <button
        type="button"
        aria-expanded={showMore}
        onClick={() => setMoreOpen((prev) => !prev)}
        className={`focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-subheadline transition-colors ${
          showMore || secondaryCount > 0
            ? "border-accent/50 bg-accent/10 text-accent-strong"
            : "border-border-default bg-surface-card text-text-secondary hover:bg-surface-overlay"
        }`}
      >
        <SlidersHorizontal className="size-3.5" aria-hidden />
        <span>更多筛选{secondaryCount > 0 ? ` (${secondaryCount})` : ""}</span>
      </button>

      {showMore ? (
        <>
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
        </>
      ) : null}

      {activeCount > 0 && onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="focus-ring inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 py-2 text-caption1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          重置筛选
        </button>
      ) : null}
    </div>
  );
}
