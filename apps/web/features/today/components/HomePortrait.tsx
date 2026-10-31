"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { Page } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { getSportConfig } from "@shared/config/sport-config";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { useCoachContext } from "@features/today/hooks/useCoachContext";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useWellness } from "@features/health/hooks/useWellness";
import { athleteRange, athleteToday, athleteWeekRange, useAthleteTimezone, activityLocalDay } from "@shared/lib/training-day";
import { assessReadiness } from "@features/today/lib/readiness-presentation";
import { freshnessCaption, hasHistory, type ConnectionState } from "@features/today/lib/freshness-caption";
import { useClientDateLabel } from "@shared/lib/client-date";
import { LovableTodayWorkout } from "./LovableTodayWorkout";
import { LovableRecovery } from "./LovableRecovery";
import { LovableWeekProgress } from "./LovableWeekProgress";
import { TodayLoadCard } from "./TodayLoadCard";
import { HomeSetupCard } from "./HomeSetupCard";

export function HomePortrait() {
  const timezone = useAthleteTimezone();
  const weekRange = useMemo(() => athleteWeekRange(timezone), [timezone]);
  const todayKey = athleteToday(timezone);
  const weekEnd = useMemo(() => addDays(weekRange.from, 6), [weekRange.from]);
  const recentRange = useMemo(() => athleteRange(30, timezone), [timezone]);
  const profileQuery = useProfile();
  const coachQuery = useCoachContext();
  const integration = useSyncDetail("intervals_icu");
  const weekActivities = useActivities(weekRange.from, weekEnd);
  const recent = useActivities(recentRange.from, recentRange.to);
  const weekEvents = useCalendarEvents(weekRange.from, weekEnd);
  const weekly = useWeeklyProgress();
  const pmc = usePmcData(recentRange.from, recentRange.to);
  const wellness = useWellness(todayKey, todayKey);
  const dateLabel = useClientDateLabel({ month: "long", day: "numeric", weekday: "long" });
  const readiness = coachQuery.data?.readiness ?? null;
  const assessment = assessReadiness(readiness);
  const decision = coachQuery.data?.recommendation ?? null;
  const asOf = coachQuery.data?.data_freshness?.activities?.data_as_of?.slice(0, 10) ?? null;
  const connection: ConnectionState = integration.error ? "error" : integration.loading || !integration.data ? "loading" : integration.data.status === "connected" ? "connected" : "disconnected";
  const caption = freshnessCaption(asOf, connection);
  const error = [coachQuery.error, weekActivities.error, recent.error, weekly.error].find((value): value is string => Boolean(value)) ?? null;
  const reload = () => { coachQuery.reload(); weekActivities.reload(); recent.reload(); weekly.reload(); };
  const todayEvent = useMemo(() => {
    const withPrescription = weekEvents.events.filter((event) => event.workout_prescription);
    return withPrescription.find((event) => activityLocalDay(event.start_time, timezone) === todayKey) ?? withPrescription[0] ?? null;
  }, [weekEvents.events, timezone, todayKey]);
  const recentActivity = recent.data[0] ?? null;
  const hasData = hasHistory({ asOf, activityCount: recent.data.length, wellnessCount: 0 });
  return <Page eyebrow={dateLabel} title="今天">
    <div data-testid="home-portrait" className="space-y-4">
      {error ? <div role="alert" className="flex items-center justify-between rounded-xl border border-error/30 p-3 text-xs text-error"><span>{error}</span><button type="button" onClick={reload}>重试</button></div> : null}
      {!hasData ? <HomeSetupCard connection={connection} lastSync={integration.data?.last_sync ?? null} profile={profileQuery.profile} /> : <>
        <div className="flex items-center justify-between rounded-full bg-secondary px-3 py-1.5 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-accent-strong" />{"Intervals.icu"} {connection === "connected" ? "同步正常" : connection === "error" ? "同步异常" : "未连接"} · {integration.data?.last_sync ? new Date(integration.data.last_sync).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : caption}</span><button type="button" onClick={reload} className="flex items-center gap-1 text-accent-strong"><RefreshCw className="h-3.5 w-3.5" />同步</button></div>
        <LovableTodayWorkout testId="home-workout" decision={decision} prescription={todayEvent?.workout_prescription ?? null} distanceM={todayEvent?.predicted_distance_m ?? null} linkedActivityId={todayEvent?.linked_activity_id ?? null} />
        <section aria-label="恢复信号" data-testid="home-recovery"><LovableRecovery readiness={readiness} soreness={wellness.data[0]?.soreness ?? null} score={assessment.available ? readiness?.score ?? null : null} conclusionTestId="home-decision" readingsTestId="home-readings" /></section>
        <TodayLoadCard point={pmc.data.at(-1) ?? null} />
        <LovableWeekProgress week={weekly.currentWeek} activities={weekActivities.data} events={weekEvents.events} timezone={timezone} />
        {recentActivity ? <Link href={`/activities/${recentActivity.activity_id}`} className="surface flex items-center gap-3 p-4 transition-colors hover:bg-secondary/60"><div className="flex-1"><div className="eyebrow">最近一次活动 · {recentActivity.start_time.slice(0, 10)}</div><div className="mt-1 font-semibold">{recentActivity.name?.trim() || getSportConfig(recentActivity.sport).label}</div><div className="num mt-1 flex flex-wrap gap-4 text-base text-muted-foreground"><span>{recentActivity.distance_m != null ? `${(recentActivity.distance_m / 1000).toFixed(2)} km` : formatDuration(recentActivity.duration_s ?? 0)}</span><span>{recentActivity.avg_speed ? `${formatPaceFromSeconds(Math.round(1000 / recentActivity.avg_speed))}/km` : "未记录配速"}</span><span>{recentActivity.avg_hr ?? NO_VALUE} bpm</span><span>TSS {Math.round(recentActivity.tss ?? 0)}</span></div></div><ChevronRight className="h-5 w-5 text-muted-foreground" /></Link> : null}
      </>}
    </div>
  </Page>;
}

function addDays(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}
