"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useClientDayRange } from "@shared/lib/client-date";
import { ReadingStrip } from "@shared/ui/ReadingStrip";
import { Card } from "@shared/ui/Card";
import {
  ActivityFilters,
  type ActivityFilterState,
} from "@features/activity/components/ActivityFilters";
import { ViewToggle, type ViewMode } from "@features/activity/components/ViewToggle";
import { MobileFilterToggle } from "@features/activity/components/MobileFilterToggle";
import { ActivitiesContent } from "@features/activity/components/ActivitiesContent";
import { filterActivities } from "@features/activity/lib/filter-activities";
import { buildActivityTotals } from "@features/activity/lib/activity-totals";
import { ManualActivityForm } from "@features/activity/components/ManualActivityForm";
import { useActivitySports } from "@features/activity/hooks/useActivitySports";
import { getSportConfig } from "@shared/config/sport-config";
import { RecomputeStatusCard } from "@features/data/components/RecomputeStatusCard";

const DEFAULT_RANGE_DAYS = 90;

/**
 * 从 URL 查询参数解析筛选状态：URL 是筛选的单一真源，可分享、可后退。
 * 参数缺失或非法时取该维度的默认值；from/to 缺失时视为「未自定义范围」，
 * 页面回退到最近 90 天。
 */
function filtersFromParams(searchParams: URLSearchParams): ActivityFilterState {
  const sport = searchParams.get("sport") ?? "all";
  const race = searchParams.get("race") ?? "all";
  const intensity = searchParams.get("intensity") ?? "all";
  const source = searchParams.get("source") ?? "all";
  return {
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    sport,
    race: race === "race" || race === "training" ? race : "all",
    intensity: ["easy", "moderate", "hard", "unknown"].includes(intensity)
      ? (intensity as ActivityFilterState["intensity"])
      : "all",
    gpsOnly: searchParams.get("gps") === "1",
    source,
    q: searchParams.get("q") ?? "",
  };
}

/**
 * Browse-density training log: header → filters → one-line totals → table.
 * The table is the default; cards are the alternate view for scanning a short
 * list, not the shape of the page.
 */
export default function ActivitiesPage() {
  // Resolved after hydration: this used to be `useState(() => computeRange(90))`,
  // which runs during static pre-render and wrote the build machine's dates into
  // the HTML.
  const defaultRange = useClientDayRange(DEFAULT_RANGE_DAYS);
  const dataSports = useActivitySports();
  const searchParams = useSearchParams();
  const router = useRouter();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const activeFilters = useMemo(
    () => (filters.from ? filters : { ...filters, ...defaultRange }),
    [filters, defaultRange],
  );

  const setFilters = useCallback(
    (next: ActivityFilterState) => {
      const params = new URLSearchParams();
      if (next.from) params.set("from", next.from);
      if (next.to) params.set("to", next.to);
      if (next.sport !== "all") params.set("sport", next.sport);
      if (next.race && next.race !== "all") params.set("race", next.race);
      if (next.intensity !== "all") params.set("intensity", next.intensity);
      if (next.gpsOnly) params.set("gps", "1");
      if (next.source !== "all") params.set("source", next.source);
      if (next.q) params.set("q", next.q);
      const query = params.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [router],
  );

  const { data, loading, error, reload } = useActivities(activeFilters.from, activeFilters.to);
  const filtered = useMemo(() => filterActivities(data, activeFilters), [data, activeFilters]);
  const totals = useMemo(() => buildActivityTotals(filtered), [filtered]);

  const widenRange = () => setFilters({ ...filters, from: "", to: "" });

  return (
    <div className="page-stack" data-testid="activities-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-caption1 text-text-muted">
            {activeFilters.from} — {activeFilters.to}
          </p>
          <h1 id="activities-title" className="mt-1 text-display-sm font-semibold tracking-tight text-text-primary">
            训练记录
          </h1>
        </div>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MobileFilterToggle
          open={mobileFiltersOpen}
          onToggle={() => setMobileFiltersOpen((open) => !open)}
        />
        <details className="ml-auto rounded-lg border border-border-subtle bg-surface-card px-3 py-2">
          <summary className="cursor-pointer text-caption1 font-medium text-text-secondary">
            手动记录一次训练
          </summary>
          <div className="mt-3 w-full max-w-2xl border-t border-border-subtle pt-3">
            <ManualActivityForm onSaved={() => reload()} />
          </div>
        </details>
      </div>

      <div id="activity-filters" className={mobileFiltersOpen ? "" : "hidden sm:block"}>
        <ActivityFilters filters={activeFilters} onChange={setFilters} activities={data} sports={dataSports} />
      </div>

      <ReadingStrip items={totals} />

      <RecomputeStatusCard />

      {!loading && !error && filtered.length === 0 ? (
        <Card padding="lg" data-testid="activities-empty">
          <h2 className="text-title2 font-semibold text-text-primary">这个筛选下没有训练</h2>
          <p className="mt-2 max-w-xl text-subheadline leading-relaxed text-text-secondary">
            当前条件是 {activeFilters.from} 至 {activeFilters.to}，
            {activeFilters.sport === "all" ? "全部项目" : getSportConfig(activeFilters.sport).label}，
            {activeFilters.intensity === "all" ? "全部强度" : activeFilters.intensity}。
            放宽到最近 90 天通常就能看到记录。
          </p>
          <button
            type="button"
            onClick={widenRange}
            className="focus-ring mt-4 inline-flex h-10 items-center rounded-full bg-primary px-5 text-subheadline font-medium text-on-primary transition-colors hover:bg-primary-active"
          >
            放宽到最近 90 天
          </button>
        </Card>
      ) : (
        <Card padding="sm">
          <ActivitiesContent
            activities={filtered}
            loading={loading}
            error={error}
            viewMode={viewMode}
            onRetry={reload}
          />
        </Card>
      )}
    </div>
  );
}
