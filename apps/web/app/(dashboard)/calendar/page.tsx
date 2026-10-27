"use client";

import { Suspense, useMemo, useState } from "react";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { EmptyState } from "@shared/ui/EmptyState";
import { MetricStrip } from "@shared/ui/MetricStrip";
import { PageHeader } from "@shared/ui/PageHeader";
import { Section } from "@shared/ui/Section";
import { EmptyWeek, PlanErrorBanner } from "@features/calendar/components/CalendarStates";
import { PlanGenerateDialog } from "@features/plan/components/PlanGenerateDialog";
import { CalendarDaySheet } from "@features/calendar/components/CalendarDaySheet";
import { CalendarWeekSkeleton } from "@features/calendar/components/CalendarWeekSkeleton";
import { CalendarListView } from "@features/calendar/components/CalendarListView";
import { CalendarStrengthView } from "@features/calendar/components/CalendarStrengthView";
import { MobileSchedule } from "@features/calendar/components/MobileSchedule";
import { CalendarInsights } from "@features/calendar/components/CalendarInsights";
import { CalendarHeaderActions } from "@features/calendar/components/CalendarHeaderActions";
import { PlanAdherenceCard } from "@features/plan/components/PlanAdherenceCard";
import { PlanForecast } from "@features/plan/components/PlanForecast";
import { PlanQuality } from "@features/plan/components/PlanQuality";
import { PlanWeekView } from "@features/plan/components/PlanWeekView";
import { PlanMonthView } from "@features/plan/components/PlanMonthView";
import { useCalendarPage } from "@features/calendar/hooks/useCalendarPage";
import { useProfile } from "@features/settings/hooks/useProfile";
import { usePlanMatch } from "@features/calendar/hooks/usePlanMatch";
import { buildWeekSummary, isoWeek } from "@features/calendar/lib/build-week-summary";
import { qualityRange } from "@features/calendar/lib/calendar-page-view";
import { weekSummaryMetrics } from "@features/calendar/lib/week-summary-metrics";
import { athleteToday, useAthleteTimezone } from "@shared/lib/training-day";

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

  // 周摘要三格：课次、实际负荷、完成率。纯格式化，不缓存；数组每帧重建，
  // 三格的成本比一次 useMemo 的比较还低。
  const weekSummaryItems = weekSummaryMetrics(weekSummary);

  const periodLabel = useMemo(() => {
    if (view === "month") {
      return `${monthDate.getFullYear()} 年 ${monthDate.getMonth() + 1} 月`;
    }
    const { week, year } = isoWeek(weekStart);
    return `${year} 年 · 第 ${week} 周`;
  }, [view, weekStart, monthDate]);

  const planRange = useMemo(
    () => qualityRange(view, weekStart, monthDate),
    [view, weekStart, monthDate],
  );
  const { matches: planMatches } = usePlanMatch(
    planRange?.from ?? "",
    planRange?.to ?? "",
    events,
  );

  const timezone = useAthleteTimezone();
  const today = athleteToday(timezone);
  const [openIso, setOpenIso] = useState<string | null>(today);

  // A month is rendered as its days in reading order; a phone cannot show a
  // seven-column table and a table is how the month grid would have to be drawn.
  const visibleDays = useMemo(() => {
    if (view === "month") {
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const last = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: last }, (_, index) => new Date(year, month, index + 1));
    }
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      return date;
    });
  }, [view, weekStart, monthDate]);

  const selectDay = (iso: string) => {
    setOpenIso(iso);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-testid="day-row-${iso}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  const isEmptyWeek = !loading && !error && events.length === 0;

  return (
    <div className="page-stack" data-testid="calendar-page">
      <PageHeader
        meta={periodLabel}
        title={<span id="calendar-title">训练日历</span>}
        action={
          <CalendarHeaderActions
            view={view}
            onChange={handleSetView}
            onGenerate={() => setGenerateOpen(true)}
          />
        }
      />

      {view === "list" ? (
        <div className="space-y-6">
          {activitiesError ? (
            <EmptyState
              title="活动数据加载失败"
              description={activitiesError}
              action={
                <Button variant="secondary" onClick={loadEvents}>
                  重新加载
                </Button>
              }
            />
          ) : (
            <>
              <Section title="训练列表">
                <div className="p-5">
                  <CalendarListView />
                </div>
              </Section>
              <Section title="训练日志">
                <div className="p-5">
                  <CalendarStrengthView />
                </div>
              </Section>
            </>
          )}
        </div>
      ) : error ? (
        <PlanErrorBanner message={error} onRetry={loadEvents} />
      ) : (
        <div className="space-y-6">
          <MetricStrip testId="week-summary" items={weekSummaryItems} />

          <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
            <div className="min-w-0 space-y-6 lg:col-span-8">
              <div className="space-y-6 lg:hidden">
                {isEmptyWeek && <EmptyWeek onGenerate={() => setGenerateOpen(true)} />}
                {loading ? (
                  <CalendarWeekSkeleton />
                ) : (
                  <MobileSchedule
                    days={visibleDays}
                    events={events}
                    activities={activityMap}
                    matches={planMatches}
                    today={today}
                    timezone={timezone}
                    monthView={view === "month"}
                    openIso={openIso}
                    onSelectDay={selectDay}
                    onToggleDay={(iso) =>
                      setOpenIso((current) => (current === iso ? null : iso))
                    }
                    onRecord={handleSelectDate}
                  />
                )}
              </div>

              <div className="hidden lg:block">
                {loading ? (
                  <CalendarWeekSkeleton />
                ) : (
                  <Card padding="sm">
                    {view === "month" ? (
                      <PlanMonthView
                        events={events}
                        monthDate={monthDate}
                        onNavMonth={navMonth}
                        onSelectDate={handleSelectDate}
                        completedActivities={activityMap}
                      />
                    ) : (
                      <PlanWeekView
                        events={events}
                        weekStart={weekStart}
                        onNavWeek={navWeek}
                        onSelectDate={handleSelectDate}
                        completedActivities={activityMap}
                      />
                    )}
                  </Card>
                )}
              </div>
              <Section title="训练日志">
                <div className="p-5">
                  <CalendarStrengthView />
                </div>
              </Section>
            </div>

            <aside className="space-y-6 lg:col-span-4">
              <CalendarInsights>
                <Card padding="md">
                  <CardHeader title="近 7 日执行" />
                  <PlanAdherenceCard />
                </Card>
                <Card padding="md">
                  <CardHeader title="28 日负荷预测" />
                  <PlanForecast events={events} />
                </Card>
                <Card padding="md">
                  <CardHeader title="计划评分" />
                  <PlanQuality from={planRange?.from} to={planRange?.to} />
                </Card>
              </CalendarInsights>
            </aside>
          </div>
        </div>
      )}

      {isGridView && !loading && !error && (
        <CalendarDaySheet
          selectedDate={selectedDate}
          activities={summaryActivities}
          editingEvent={editingEvent}
          onSave={handleBuilderSave}
          onActivitySaved={handleActivitySaved}
          onClose={() => setSelectedDate(null)}
        />
      )}
      <PlanGenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={loadEvents}
        trainingDays={profile?.weekly_training_days ?? 5}
      />
    </div>
  );
}
