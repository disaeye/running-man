"use client";

import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useClientDayRange } from "@shared/lib/client-date";
import { ReadingStrip } from "@shared/ui/ReadingStrip";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { ActiveFilterChips } from "@features/activity/components/ActiveFilterChips";
import {
  ActivityFilters,
  countActiveActivityFilters,
  INTENSITY_LABELS,
  type ActivityFilterState,
} from "@features/activity/components/ActivityFilters";
import { ViewToggle, type ViewMode } from "@features/activity/components/ViewToggle";
import { MobileFilterToggle } from "@features/activity/components/MobileFilterToggle";
import { ActivitiesContent } from "@features/activity/components/ActivitiesContent";
import { filterActivities } from "@features/activity/lib/filter-activities";
import { buildActivityTotals } from "@features/activity/lib/activity-totals";
import { useActivitySports } from "@features/activity/hooks/useActivitySports";
import { getSportConfig } from "@shared/config/sport-config";
import { RecomputeStatusCard } from "@features/data/components/RecomputeStatusCard";

const DEFAULT_RANGE_DAYS = 90;

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
 * 训练档案：全部历史记录的检索与对比。筛选、视图与分页全部写在 URL 上，
 * 手动记录与导入统一由工作区页头的「添加训练」承载。
 */
export default function ActivitiesPage() {
  const defaultRange = useClientDayRange(DEFAULT_RANGE_DAYS);
  const dataSports = useActivitySports();
  const searchParams = useSearchParams();
  const router = useRouter();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const returnTo = searchParams.size ? `/activities?${searchParams}` : "/activities";
  const viewMode: ViewMode = searchParams.get("view") === "list" ? "list" : "table";
  const restoredScroll = useRef(false);
  useEffect(() => {
    const savedScroll = sessionStorage.getItem("running-man:activities-scroll");
    if (restoredScroll.current || !savedScroll) return;
    restoredScroll.current = true;
    window.scrollTo({ top: Number(savedScroll), behavior: "instant" });
    sessionStorage.removeItem("running-man:activities-scroll");
  }, []);
  useEffect(() => {
    const saveScroll = () => sessionStorage.setItem("running-man:activities-scroll", String(window.scrollY));
    const container = document.querySelector('[data-testid="activity-table"]');
    container?.addEventListener("click", saveScroll, { capture: true });
    return () => container?.removeEventListener("click", saveScroll, { capture: true });
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const activeFilters = useMemo(
    () => (filters.from ? filters : { ...filters, ...defaultRange }),
    [filters, defaultRange],
  );

  const pushParams = useCallback(
    (next: ActivityFilterState, nextView: ViewMode) => {
      const params = new URLSearchParams();
      if (nextView === "list") params.set("view", "list");
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

  const setFilters = useCallback(
    (next: ActivityFilterState) => pushParams(next, viewMode),
    [pushParams, viewMode],
  );
  const setViewMode = useCallback(
    (nextView: ViewMode) => pushParams(filters, nextView),
    [pushParams, filters],
  );

  const { data, loading, error, reload } = useActivities(activeFilters.from, activeFilters.to);
  const filtered = useMemo(() => filterActivities(data, activeFilters), [data, activeFilters]);
  const totals = useMemo(() => buildActivityTotals(filtered), [filtered]);
  const activeFilterCount = countActiveActivityFilters(activeFilters);

  const resetAllFilters = () =>
    setFilters({ from: filters.from, to: filters.to, sport: "all", race: "all", intensity: "all", gpsOnly: false, source: "all", q: "" });
  const widenRange = () =>
    setFilters({ from: "", to: "", sport: "all", race: "all", intensity: "all", gpsOnly: false, source: "all", q: "" });

  return (
    <div data-testid="activities-page" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MobileFilterToggle
            open={mobileFiltersOpen}
            activeCount={activeFilterCount}
            onToggle={() => setMobileFiltersOpen((open) => !open)}
          />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
        <p className="num text-caption1 text-text-muted" data-testid="activities-range">
          {activeFilters.from} — {activeFilters.to}
        </p>
      </div>

      <ActiveFilterChips filters={activeFilters} onChange={setFilters} onReset={resetAllFilters} />

      <div id="activity-filters" className={mobileFiltersOpen ? "" : "hidden sm:block"}>
        <ActivityFilters
          filters={activeFilters}
          onChange={setFilters}
          onReset={resetAllFilters}
          activities={data}
          sports={dataSports}
        />
      </div>

      <ReadingStrip items={totals} />
      <RecomputeStatusCard />

      {!loading && !error && filtered.length === 0 ? (
        <Card padding="lg" data-testid="activities-empty">
          <h2 className="text-title2 font-semibold text-text-primary">这个筛选下没有训练</h2>
          <p className="mt-2 max-w-xl text-subheadline leading-relaxed text-text-secondary">
            当前条件：{activeFilters.from} 至 {activeFilters.to}，
            {activeFilters.sport === "all" ? "全部项目" : getSportConfig(activeFilters.sport).label}，
            {INTENSITY_LABELS[activeFilters.intensity]}
            {activeFilters.q ? `，关键词“${activeFilters.q}”` : ""}。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {activeFilterCount > 0 ? (
              <Button type="button" onClick={resetAllFilters}>
                清空筛选条件
              </Button>
            ) : null}
            {filters.from ? (
              <Button type="button" variant={activeFilterCount > 0 ? "outline" : "default"} onClick={widenRange}>
                放宽到最近 90 天
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <ActivitiesContent
          activities={filtered}
          from={activeFilters.from}
          to={activeFilters.to}
          loading={loading}
          error={error}
          viewMode={viewMode}
          returnTo={returnTo}
          onRetry={reload}
        />
      )}
    </div>
  );
}
