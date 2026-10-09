"use client";

import { useState, useMemo } from "react";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useClientDayRange } from "@shared/lib/client-date";
import { ActivityTotals } from "@features/activity/components/ActivityTotals";
import {
  ActivityFilters,
  type ActivityFilterState,
} from "@features/activity/components/ActivityFilters";
import {
  filterActivities,
  PROJECT_FILTERS,
  type ProjectFilter,
} from "@features/activity/lib/filter-activities";
import { SessionCard } from "@features/activity/components/SessionCard";
import { SportDistributionBar } from "@features/activity/components/SportDistributionBar";
import { WeeklyGroup } from "@features/activity/components/WeeklyGroup";
import { EmptyState } from "@shared/ui/EmptyState";
import { CalendarDaySheet } from "@features/calendar/components/CalendarDaySheet";
import { cn } from "@shared/lib/utils";
import { activityLocalDay, useAthleteTimezone } from "@shared/lib/training-day";
import type { ActivitySummary } from "@shared/types/activity";

interface WeekGroup {
  weekStart: Date;
  weekLabel: string;
  weekRange: string;
  activities: ActivitySummary[];
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const dow = date.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isoWeekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round(diff / 7);
}

function formatMmDd(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function groupByWeek(activities: ActivitySummary[], timezone: string): WeekGroup[] {
  const now = new Date();
  const [year = 0, month = 1, day = 1] = activityLocalDay(now, timezone).split("-").map(Number);
  const athleteNow = new Date(year, month - 1, day);
  const thisMonday = getMonday(athleteNow);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const buckets = new Map<string, { weekStart: Date; activities: ActivitySummary[] }>();
  for (const a of activities) {
    const [year = 0, month = 1, day = 1] = activityLocalDay(a.start_time, timezone).split("-").map(Number);
    const monday = getMonday(new Date(year, month - 1, day));
    const key = monday.toISOString();
    const existing = buckets.get(key);
    if (existing) existing.activities.push(a);
    else buckets.set(key, { weekStart: monday, activities: [a] });
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([, { weekStart, activities: weekActivities }]) => {
      const sunday = new Date(weekStart);
      sunday.setDate(weekStart.getDate() + 6);
      const isThisWeek = weekStart.getTime() === thisMonday.getTime();
      const isLastWeek = weekStart.getTime() === lastMonday.getTime();
      const label = isThisWeek
        ? "本周"
        : isLastWeek
          ? "上周"
          : `W${String(isoWeekNumber(weekStart)).padStart(2, "0")}`;
      return {
        weekStart,
        weekLabel: label,
        weekRange: `${formatMmDd(weekStart)} - ${formatMmDd(sunday)}`,
        activities: weekActivities,
      };
    });
}

export function CalendarListView() {
  const timezone = useAthleteTimezone();
  // Resolved after hydration so the pre-rendered HTML carries no dates: this
  // used to be `useState(() => computeRange(90))`, which baked the build
  // machine's calendar day into `<input value="2026-09-14">`. The empty range
  // until then means no fetch is issued, which the hook already handles.
  const defaultRange = useClientDayRange(90);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  // `filters` is the single source of truth for the range; a separate
  // `dateRange` state only ever mirrored it.
  const [filters, setFilters] = useState<ActivityFilterState>({
    from: "",
    to: "",
    sport: "all",
    intensity: "all",
    gpsOnly: false,
    source: "all",
  });
  // The range the athlete is actually viewing: their own choice once made,
  // otherwise the hydrated default. Memoised so the identity is stable across
  // renders, which the filter memo downstream depends on.
  const activeFilters = useMemo(
    () => (filters.from ? filters : { ...filters, ...defaultRange }),
    [filters, defaultRange],
  );

  const { data, loading, error, reload } = useActivities(activeFilters.from, activeFilters.to);

  const filtered = useMemo(
    () => filterActivities(data, activeFilters, projectFilter),
    [data, activeFilters, projectFilter],
  );

  const weekGroups = useMemo(() => groupByWeek(filtered, timezone), [filtered, timezone]);

  const sheetActivities = useMemo(() => {
    if (!selectedDate) return [];
    return filtered.filter((a) => activityLocalDay(a.start_time, timezone) === selectedDate);
  }, [selectedDate, filtered, timezone]);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setMobileFiltersOpen((o) => !o)}
        className="focus-ring flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline font-medium text-text-primary transition-colors hover:bg-surface-overlay sm:hidden"
        aria-expanded={mobileFiltersOpen}
        aria-controls="activity-filters"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
        </svg>
        筛选
      </button>

      <div id="activity-filters" className={mobileFiltersOpen ? "" : "hidden sm:block"}>
        <ActivityFilters
          filters={activeFilters}
          onChange={(f) => setFilters(f)}
          activities={data}
        />
      </div>

      <ActivityTotals activities={filtered} />
      <SportDistributionBar activities={filtered} />

      <div
        role="group"
        aria-label="训练项目筛选"
        className="flex flex-wrap items-center gap-2"
        data-testid="project-filter"
      >
        {PROJECT_FILTERS.map((f) => {
          const isActive = projectFilter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setProjectFilter(f.value)}
              aria-pressed={isActive}
              data-project-filter={f.value}
              className={cn(
                "focus-ring inline-flex min-h-[44px] items-center rounded-full px-3 py-1 text-subheadline font-semibold transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "border border-border-default bg-surface-card text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && (
        <EmptyState
          title="训练记录加载失败"
          description={error}
          action={<button type="button" onClick={reload} className="focus-ring inline-flex min-h-[44px] items-center rounded-full border border-border-default bg-surface-card px-4 text-subheadline font-medium text-text-primary transition-colors hover:bg-surface-overlay">重新加载</button>}
        />
      )}

      {loading && !error && (
        <div className="py-12 text-center text-subheadline text-text-muted" role="status" aria-busy="true">加载中...</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title="暂无活动记录"
          description="所选范围内没有符合条件的活动，请调整筛选条件或上传活动数据。"
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          {weekGroups.map((group) => (
            <div key={group.weekStart.toISOString()} className="relative">
              <WeeklyGroup
                weekLabel={group.weekLabel}
                weekRange={group.weekRange}
                activities={group.activities}
                defaultExpanded={group.weekLabel === "本周"}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      const activity = group.activities[0];
                      setSelectedDate(activity ? activityLocalDay(activity.start_time, timezone) : null);
                    }}
                    className="focus-ring inline-flex min-h-[44px] items-center rounded-md px-2 text-caption1 text-text-muted transition-colors hover:border-accent/40 hover:text-accent-strong"
                    aria-label={`查看 ${group.weekRange} 详情`}
                  >
                    详情
                  </button>
                }
              >
                {group.activities.map((a) => (
                  <SessionCard key={a.activity_id} activity={a} />
                ))}
              </WeeklyGroup>
            </div>
          ))}
        </div>
      )}

      <CalendarDaySheet
        selectedDate={selectedDate}
        activities={sheetActivities}
        editingEvent={undefined}
        onSave={() => setSelectedDate(null)}
        onActivitySaved={() => {
          void reload();
          setSelectedDate(null);
        }}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}
