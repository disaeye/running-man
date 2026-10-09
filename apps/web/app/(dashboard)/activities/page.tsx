"use client";

import { useState, useMemo } from "react";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useClientDayRange } from "@shared/lib/client-date";
import { ActivityTotals } from "@features/activity/components/ActivityTotals";
import {
  ActivityFilters,
  type ActivityFilterState,
} from "@features/activity/components/ActivityFilters";
import { ViewToggle, type ViewMode } from "@features/activity/components/ViewToggle";
import { MobileFilterToggle } from "@features/activity/components/MobileFilterToggle";
import { ActivitiesContent } from "@features/activity/components/ActivitiesContent";
import { filterActivities } from "@features/activity/lib/filter-activities";
import { ManualActivityForm } from "@features/activity/components/ManualActivityForm";
import { RecomputeStatusCard } from "@features/data/components/RecomputeStatusCard";

/**
 * Browse-density training log:
 * header → filters → one-line totals → list/table (no default trends chart).
 */
export default function ActivitiesPage() {
  // Resolved after hydration: this used to be `useState(() => computeRange(90))`,
  // which runs during static pre-render and wrote the build machine's dates into
  // the HTML. See `useClientDayRange`.
  const defaultRange = useClientDayRange(90);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ActivityFilterState>({
    from: "",
    to: "",
    sport: "all",
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

  return (
    <div className="page-stack" data-testid="activities-page">
      <section className="flex flex-wrap items-end justify-between gap-6 border-b border-border-subtle pb-7" aria-labelledby="activities-title">
        <div><p className="mb-3 font-mono text-caption2 uppercase tracking-[0.24em] text-primary">LOG / LAST 90 DAYS</p><h1 id="activities-title" className="text-display-md text-text-primary">训练活动记录</h1><p className="mt-3 max-w-xl text-subheadline text-text-secondary">所有训练都留下痕迹。按项目筛选，回到每一次努力发生的现场。</p></div><ViewToggle mode={viewMode} onChange={setViewMode} />
      </section>
      <details className="glass-surface rounded-xl p-4">
        <summary className="cursor-pointer text-subheadline font-semibold text-text-primary">
          手动记录实际训练
        </summary>
        <div className="mt-4 border-t border-border-subtle pt-4">
          <ManualActivityForm onSaved={() => reload()} />
        </div>
      </details>
      <RecomputeStatusCard />
      <MobileFilterToggle open={mobileFiltersOpen} onToggle={() => setMobileFiltersOpen((o) => !o)} />
      <div id="activity-filters" className={mobileFiltersOpen ? "" : "hidden sm:block"}><ActivityFilters filters={activeFilters} onChange={setFilters} activities={data} /></div>
      <div className="glass-surface rounded-xl p-4"><ActivityTotals activities={filtered} /></div>
      <div className="glass-surface rounded-xl p-4 sm:p-6"><ActivitiesContent activities={filtered} loading={loading} error={error} viewMode={viewMode} onRetry={reload} /></div>
    </div>
  );
}
