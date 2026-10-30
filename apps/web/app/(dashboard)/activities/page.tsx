"use client";

import { useState, useMemo } from "react";
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
import { RecomputeStatusCard } from "@features/data/components/RecomputeStatusCard";

const DEFAULT_RANGE_DAYS = 90;

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
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ActivityFilterState>({
    from: "",
    to: "",
    sport: "all",
    race: "all",
    intensity: "all",
    gpsOnly: false,
    source: "all",
  });
  const activeFilters = useMemo(
    () => (filters.from ? filters : { ...filters, ...defaultRange }),
    [filters, defaultRange],
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
        <ActivityFilters filters={activeFilters} onChange={setFilters} activities={data} />
      </div>

      <ReadingStrip items={totals} />

      <RecomputeStatusCard />

      {!loading && !error && filtered.length === 0 ? (
        <Card padding="lg" data-testid="activities-empty">
          <h2 className="text-title2 font-semibold text-text-primary">这个筛选下没有训练</h2>
          <p className="mt-2 max-w-xl text-subheadline leading-relaxed text-text-secondary">
            当前条件是 {activeFilters.from} 至 {activeFilters.to}，
            {activeFilters.sport === "all" ? "全部项目" : activeFilters.sport}，
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
