"use client";

import { Suspense, useMemo } from "react";
import { Button } from "@shared/ui/button";
import { EmptyState } from "@shared/ui/EmptyState";
import { PageHeader } from "@shared/ui/PageHeader";
import { Section } from "@shared/ui/Section";
import { PlanErrorBanner } from "@features/calendar/components/CalendarStates";
import { PlanGenerateDialog } from "@features/plan/components/PlanGenerateDialog";
import { CalendarDaySheet } from "@features/calendar/components/CalendarDaySheet";
import { CalendarWeekSkeleton } from "@features/calendar/components/CalendarWeekSkeleton";
import { CalendarListView } from "@features/calendar/components/CalendarListView";
import { CalendarStrengthView } from "@features/calendar/components/CalendarStrengthView";
import { CalendarHeaderActions } from "@features/calendar/components/CalendarHeaderActions";
import { CalendarInsights } from "@features/calendar/components/CalendarInsights";
import { Card } from "@shared/ui/Card";
import { MetricStrip } from "@shared/ui/MetricStrip";
import { PlanForecast } from "@features/plan/components/PlanForecast";
import { PlanQuality } from "@features/plan/components/PlanQuality";
import { DemoMonthGrid } from "@features/calendar/components/DemoMonthGrid";
import { DemoMonthSummary } from "@features/calendar/components/DemoMonthSummary";
import { DemoWeekStrip } from "@features/calendar/components/DemoWeekStrip";
import { DemoDayPanel } from "@features/calendar/components/DemoDayPanel";
import { useCalendarPage } from "@features/calendar/hooks/useCalendarPage";
import { useProfile } from "@features/settings/hooks/useProfile";
import { buildWeekSummary, isoWeek } from "@features/calendar/lib/build-week-summary";
import { weekSummaryMetrics } from "@features/calendar/lib/week-summary-metrics";
import { qualityRange } from "@features/calendar/lib/calendar-page-view";
import { athleteToday, useAthleteTimezone } from "@shared/lib/training-day";
import { activityLocalDay } from "@shared/lib/training-day";
import { DemoLegend, monthTotalsFor } from "@features/calendar/components/DemoCalendarSummary";

/**
 * 训练日历（按 stich_demo 的 cal.html 重排）。
 *
 * 顺序与参考稿一致：
 *   1. 月份与周期导航 + 视图切换
 *   2. 月度遥测三格摘要
 *   3. 图例
 *   4. 月历热力矩阵
 *   5. 本周快览条
 *   6. 选中日期详情面板（计划与实际对照）
 *
 * 桌面端是同一批卡片的两栏排布：左边是月历与周条，右边常驻选中日详情；
 * 点左边任意一天，右边立刻跟着变。
 */
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
  const timezone = useAthleteTimezone();
  const today = athleteToday(timezone);

  // 选中的日期：默认是今天，所以右侧面板一开始就有内容。
  const activeDate = selectedDate ?? today;

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

  const weekSummaryItems = useMemo(
    () => weekSummaryMetrics(buildWeekSummary({ events, activityMap, weekStart, timezone })),
    [events, activityMap, weekStart, timezone],
  );

  // 月度三格摘要：跑量、课次、爬升，都按当前月份算。
  const monthTotals = useMemo(
    () => monthTotalsFor(events, activityMap, monthDate, timezone),
    [events, activityMap, monthDate, timezone],
  );

  // 周条的七天：从周一开始。
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + index);
        return {
          iso: toIso(date),
          dayLabel: WEEKDAY_NAMES[index] ?? "",
        };
      }),
    [weekStart],
  );

  const activeEvent = useMemo(
    () => events.find((event) => activityLocalDay(event.start_time, timezone) === activeDate),
    [events, timezone, activeDate],
  );
  const activeActivities = activityMap.get(activeDate) ?? [];

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
            periodLabel={periodLabel}
            onNavigate={(delta) => {
              if (view === "month") navMonth(delta);
              else navWeek(delta);
            }}
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
        <div className="space-y-4">
          {view === "month" ? (
            <>
              <DemoMonthSummary
                actualDistanceM={monthTotals.actualDistanceM}
                plannedDistanceM={monthTotals.plannedDistanceM}
                completedSessions={monthTotals.completedSessions}
                plannedSessions={monthTotals.plannedSessions}
                elevationM={monthTotals.elevationM}
              />
              <DemoLegend />
            </>
          ) : (
            <MetricStrip testId="week-summary" items={weekSummaryItems} />
          )}

          <div className="grid min-w-0 gap-4 lg:grid-cols-12 lg:items-start">
            <div className="min-w-0 space-y-4 lg:col-span-7">
              {loading ? (
                <CalendarWeekSkeleton />
              ) : view === "month" ? (
                <DemoMonthGrid
                  events={events}
                  monthDate={monthDate}
                  completedActivities={activityMap}
                  selectedDate={activeDate}
                  testId="plan-month-grid"
                  dayTestIdPrefix="plan-month-day"
                  onSelectDate={(iso) => {
                    handleSelectDate(iso);
                    setSelectedDate(iso);
                  }}
                />
              ) : (
                <DemoWeekStrip
                  days={weekDays}
                  events={events}
                  activities={activityMap}
                  selectedDate={activeDate}
                  testId="plan-week-grid"
                  dayTestIdPrefix="plan-week-day"
                  onSelectDate={(iso) => {
                    handleSelectDate(iso);
                    setSelectedDate(iso);
                  }}
                />
              )}
            </div>

            <aside className="min-w-0 space-y-4 lg:col-span-5">
              <DemoDayPanel
                date={activeDate}
                event={activeEvent}
                activities={activeActivities}
                onEdit={() => handleSelectDate(activeDate)}
                onAdd={() => handleSelectDate(activeDate)}
              />
              <CalendarInsights>
                <Card padding="md" data-testid="calendar-plan-quality">
                  <PlanQuality from={planRange?.from} to={planRange?.to} />
                </Card>
                <Card padding="md" data-testid="calendar-load-forecast">
                  <PlanForecast events={events} />
                </Card>
              </CalendarInsights>
            </aside>
          </div>
        </div>
      )}

      {isGridView && !loading && !error && selectedDate != null && (
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

const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
