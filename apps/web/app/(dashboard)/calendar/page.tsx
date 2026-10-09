"use client";

import { Suspense, useMemo } from "react";
import { AlertTriangle, Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { Button } from "@shared/ui/button";
import { EmptyState } from "@shared/ui/EmptyState";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { PlanGenerateDialog } from "@features/plan/components/PlanGenerateDialog";
import { CalendarDaySheet } from "@features/calendar/components/CalendarDaySheet";
import { CalendarWeekSkeleton } from "@features/calendar/components/CalendarWeekSkeleton";
import { WeekSummaryChip } from "@features/calendar/components/WeekSummaryChip";
import { CalendarListView } from "@features/calendar/components/CalendarListView";
import { CalendarStrengthView } from "@features/calendar/components/CalendarStrengthView";
import { MobileAgenda } from "@features/calendar/components/MobileAgenda";
import { PlanAdherenceCard } from "@features/plan/components/PlanAdherenceCard";
import { PlanForecast } from "@features/plan/components/PlanForecast";
import { PlanQuality } from "@features/plan/components/PlanQuality";
import { PlanWeekView } from "@features/plan/components/PlanWeekView";
import { PlanMonthView } from "@features/plan/components/PlanMonthView";
import { useCalendarPage } from "@features/calendar/hooks/useCalendarPage";
import { useProfile } from "@features/settings/hooks/useProfile";
import { usePlanMatch } from "@features/calendar/hooks/usePlanMatch";
import { buildWeekSummary, isoWeek } from "@features/calendar/lib/build-week-summary";
import { type CalendarView } from "./calendar-view";
import { toISODate } from "@shared/lib/format";

function qualityRange(
  view: CalendarView,
  weekStart: Date,
  monthDate: Date,
): { from: string; to: string } | undefined {
  if (view === "week") {
    const from = new Date(weekStart);
    from.setDate(from.getDate() - 1);
    const to = new Date(weekStart);
    to.setDate(to.getDate() + 7);
    return { from: toISODate(from), to: toISODate(to) };
  }
  if (view === "month") {
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth();
    return { from: toISODate(new Date(y, m, 0)), to: toISODate(new Date(y, m + 1, 1)) };
  }
  return undefined;
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<CalendarWeekSkeleton />}>
      <CalendarPageContent />
    </Suspense>
  );
}

function CalendarPageContent() {
  const {
    view,
    handleSetView,
    weekStart,
    monthDate,
    events,
    loading,
    error,
    activitiesError,
    selectedDate,
    setSelectedDate,
    editingEvent,
    generateOpen,
    setGenerateOpen,
    activityMap,
    isGridView,
    navWeek,
    navMonth,
    handleSelectDate,
    handleBuilderSave,
    handleActivitySaved,
    summaryActivities,
    loadEvents,
  } = useCalendarPage();

  const { profile } = useProfile();
  const weekSummary = useMemo(
    () => buildWeekSummary({ events, activityMap, weekStart }),
    [events, activityMap, weekStart],
  );
  // Was hard-coded as "WEEK 35", so the header was wrong for most of the year.
  const weekLabel = useMemo(() => {
    const { week, year } = isoWeek(weekStart);
    return `WEEK ${String(week).padStart(2, "0")} · ${year}`;
  }, [weekStart]);

  const planRange = useMemo(
    () => qualityRange(view, weekStart, monthDate),
    [view, weekStart, monthDate],
  );
  const { matches: planMatches } = usePlanMatch(
    planRange?.from ?? "",
    planRange?.to ?? "",
    events,
  );

  return (
    <div className="page-stack" data-testid="calendar-page">
      <section className="flex flex-wrap items-end justify-between gap-6 border-b border-border-subtle pb-7" aria-labelledby="calendar-title">
        <div><p className="mb-3 font-mono text-caption2 uppercase tracking-[0.24em] text-primary">PLANNING / {weekLabel}</p><h1 id="calendar-title" className="text-display-md text-text-primary">训练课表与周期计划</h1><p className="mt-3 max-w-xl text-subheadline text-text-secondary">把未来的训练写下来，才知道今天应该留下多少空间。</p></div>
        <div className="flex flex-wrap items-center gap-2.5"><Tabs value={view} onValueChange={(v) => handleSetView(v as CalendarView)}><TabsList className="border border-border-default bg-surface-sunken/70 p-1">{([['week','周'],['month','月'],['list','日志'],['strength','力量']] as const).map(([value, label]) => <TabsTrigger key={value} value={value} className="min-h-9 rounded-md px-3 text-caption1">{label}</TabsTrigger>)}</TabsList></Tabs><Button onClick={() => setGenerateOpen(true)} size="sm" className="gap-1.5"><Sparkles className="size-3.5" /><span>生成计划</span></Button></div>
      </section>
      {view !== "list" ? <>{error ? <PlanErrorBanner message={error} onRetry={loadEvents} /> : <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-sunken/45 px-4 py-3"><div className="flex items-center gap-2 font-mono text-caption2 uppercase tracking-[0.14em] text-text-secondary"><CalendarIcon className="size-4 text-primary" />{view === "week" ? "Current week" : "Current month"}</div><WeekSummaryChip {...weekSummary} /></div>{loading ? <CalendarWeekSkeleton /> : <div className="grid gap-6 lg:grid-cols-12 lg:items-start"><div className="min-w-0 space-y-6 lg:col-span-8"><div className="block lg:hidden"><MobileAgenda events={events} activities={activityMap} weekStart={weekStart} onSelectDate={handleSelectDate} matches={planMatches} /></div><div className="hidden rounded-xl border border-border-subtle bg-surface-card/55 p-4 lg:block">{view === "month" ? <PlanMonthView events={events} monthDate={monthDate} onNavMonth={navMonth} onSelectDate={handleSelectDate} completedActivities={activityMap} /> : <PlanWeekView events={events} weekStart={weekStart} onNavWeek={navWeek} onSelectDate={handleSelectDate} completedActivities={activityMap} />}</div><div className="rounded-xl border border-border-subtle bg-surface-card/55 p-4"><CalendarStrengthView /></div></div><aside className="space-y-5 lg:col-span-4"><div className="rounded-xl border border-border-subtle bg-surface-card/55 p-4"><PlanAdherenceCard /></div><div className="rounded-xl border border-border-subtle bg-surface-card/55 p-4"><PlanForecast events={events} /></div><div className="rounded-xl border border-border-subtle bg-surface-card/55 p-4"><PlanQuality from={planRange?.from} to={planRange?.to} /></div></aside></div>}</div>}</> : <div className="space-y-6">{activitiesError ? <EmptyState title="活动数据加载失败" description={activitiesError} action={<Button variant="secondary" onClick={loadEvents}>重新加载</Button>} /> : <><div className="rounded-xl border border-border-subtle bg-surface-card/55 p-5"><CalendarListView /></div><div className="rounded-xl border border-border-subtle bg-surface-card/55 p-5"><CalendarStrengthView /></div></>}</div>}
      {isGridView && !loading && !error && <CalendarDaySheet selectedDate={selectedDate} activities={summaryActivities} editingEvent={editingEvent} onSave={handleBuilderSave} onActivitySaved={handleActivitySaved} onClose={() => setSelectedDate(null)} />}
      <PlanGenerateDialog open={generateOpen} onClose={() => setGenerateOpen(false)} onGenerated={loadEvents} trainingDays={profile?.weekly_training_days ?? 5} />
    </div>
  );
}


function PlanErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-center text-rose-600 dark:text-rose-400">
      <AlertTriangle className="mx-auto h-6 w-6" />
      <p className="mt-2 text-sm font-semibold">课表加载失败</p>
      <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/80">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
        重新尝试
      </Button>
    </div>
  );
}
