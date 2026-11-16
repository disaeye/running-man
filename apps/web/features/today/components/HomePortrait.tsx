"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mutate } from "swr";
import { CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { Page } from "@shared/ui/Lovable";
import { apiFetch } from "@shared/lib/api";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { getSportConfig } from "@shared/config/sport-config";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { isJobActive, useSyncJob, type SyncJob } from "@features/data/hooks/useSyncJobs";
import { NOTIFICATIONS_KEY } from "@features/today/hooks/useNotifications";
import { useCoachContext } from "@features/today/hooks/useCoachContext";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useWellness } from "@features/health/hooks/useWellness";
import { athleteRange, athleteToday, athleteWeekRange, useAthleteTimezoneState, activityLocalDay } from "@shared/lib/training-day";
import { assessReadiness } from "@features/today/lib/readiness-presentation";
import { freshnessCaption, hasHistory, type ConnectionState } from "@features/today/lib/freshness-caption";
import { useClientDateLabel } from "@shared/lib/client-date";
import { LovableTodayWorkout } from "./LovableTodayWorkout";
import { HomeNoticeStrip } from "./HomeNoticeStrip";
import { LovableRecovery } from "./LovableRecovery";
import { LovableWeekProgress } from "./LovableWeekProgress";
import { TodayLoadCard } from "./TodayLoadCard";
import { HomeSetupCard } from "./HomeSetupCard";

/** 同步任务阶段的中文标签，进度行展示用。 */
const PHASE_LABEL: Record<SyncJob["phase"], string> = {
  activities: "活动导入",
  streams: "轨迹流",
  wellness: "健康数据",
  weather: "天气",
};

function jobProgressNote(job: SyncJob): string {
  const phase = PHASE_LABEL[job.phase] ?? job.phase;
  const windows = job.windowsTotal > 0 ? ` · 窗口 ${job.windowsDone}/${job.windowsTotal}` : "";
  return `同步中 · ${phase}${windows}`;
}

export function HomePortrait() {
  const { timezone, resolved } = useAthleteTimezoneState();
  const weekRange = useMemo(() => athleteWeekRange(timezone), [timezone]);
  const todayKey = athleteToday(timezone);
  const weekEnd = useMemo(() => addDays(weekRange.from, 6), [weekRange.from]);
  const recentRange = useMemo(() => athleteRange(30, timezone), [timezone]);
  const profileQuery = useProfile();
  const coachQuery = useCoachContext();
  const integration = useSyncDetail("intervals_icu");
  // 时区未定前不发数据请求：先用 UTC 发一轮、profile 到达后再按真实时区
  // 重发一轮，首屏会白等一整轮。
  const weekActivities = useActivities(resolved ? weekRange.from : "", resolved ? weekEnd : "");
  const recent = useActivities(resolved ? recentRange.from : "", resolved ? recentRange.to : "");
  const weekEvents = useCalendarEvents(resolved ? weekRange.from : "", resolved ? weekEnd : "");
  const weekly = useWeeklyProgress();
  const pmc = usePmcData(resolved ? recentRange.from : "", resolved ? recentRange.to : "");
  const wellness = useWellness(resolved ? todayKey : "", resolved ? todayKey : "");
  const [posting, setPosting] = useState(false);
  const [postNote, setPostNote] = useState<string | null>(null);
  // 由点击发起的同步任务 id：POST 返回的就是排队成功的任务本身，
  // 结果提示只挂在这个 id 上。
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);
  const syncJob = useSyncJob("intervals_icu");
  const job = syncJob.job;
  const jobRunning = isJobActive(job);
  const startSync = async () => {
    setPosting(true);
    setPostNote(null);
    try {
      const created = await apiFetch<{ id: string }>("/integrations/intervals_icu/sync", { method: "POST" });
      setTrackedJobId(created.id);
      await syncJob.reload();
    } catch (caught) {
      setPostNote(caught instanceof Error ? caught.message : "同步请求失败");
    } finally {
      setPosting(false);
    }
  };
  const syncing = posting || jobRunning;
  const dateLabel = useClientDateLabel({ month: "long", day: "numeric" });
  const weekdayLabel = useClientDateLabel({ weekday: "long" });
  const readiness = coachQuery.data?.readiness ?? null;
  const assessment = assessReadiness(readiness);
  const decision = coachQuery.data?.recommendation ?? null;
  const asOf = coachQuery.data?.data_freshness?.activities?.data_as_of?.slice(0, 10) ?? null;
  const connection: ConnectionState = integration.error ? "error" : integration.loading || !integration.data ? "loading" : integration.data.status === "connected" ? "connected" : "disconnected";
  const caption = freshnessCaption(asOf, connection);
  const error = [coachQuery.error, weekActivities.error, recent.error, weekly.error].find((value): value is string => Boolean(value)) ?? null;
  const reload = useCallback(() => { coachQuery.reload(); weekActivities.reload(); recent.reload(); weekly.reload(); pmc.reload(); wellness.reload(); integration.reload(); void mutate(NOTIFICATIONS_KEY); }, [coachQuery, weekActivities, recent, weekly, pmc, wellness, integration]);
  // 提示全部从任务状态派生：进行中报进度；只有点击发起的任务才报最终结果，
  // 页面打开时早已完成的旧任务不报捷。
  const trackedSettled = job != null && trackedJobId === job.id && !jobRunning;
  const syncNote = jobRunning && job ? jobProgressNote(job)
    : trackedSettled && job?.status === "success" ? `同步完成，已更新 ${job.activitiesUpserted} 条活动。`
    : trackedSettled && job?.status === "failed" ? (job.error ?? "同步失败，可在设置页查看详情。")
    : trackedSettled && job?.status === "cancelled" ? "同步已取消。"
    : postNote;
  // 数据刷新面向所有结束的任务（含后台定时同步）：见过它运行，结束后重拉一次。
  // reload 每渲染都是新引用，重复触发由 ref 防重兼为空跑。
  const seenRunningRef = useRef<string | null>(null);
  useEffect(() => {
    if (!job) return;
    if (jobRunning) {
      seenRunningRef.current = job.id;
      return;
    }
    if (seenRunningRef.current !== job.id) return;
    seenRunningRef.current = null;
    if (job.status === "success") reload();
  }, [job, jobRunning, reload]);
  const todayEvent = useMemo(() => {
    const withPrescription = weekEvents.events.filter((event) => event.workout_prescription);
    return (
      withPrescription.find((event) => activityLocalDay(event.start_time, timezone) === todayKey) ?? null
    );
  }, [weekEvents.events, timezone, todayKey]);
  const todayActivity = useMemo(
    () => recent.data.find((activity) => activityLocalDay(activity.start_time, timezone) === todayKey) ?? null,
    [recent.data, timezone, todayKey],
  );
  const recentActivity = recent.data[0] ?? null;
  const hasData = hasHistory({ asOf, activityCount: recent.data.length, wellnessCount: 0 });
  return <Page eyebrow={<span className="flex items-baseline gap-2"><span className="num text-lg font-semibold tracking-tight text-text-secondary">{dateLabel}</span><span className="text-caption1 text-text-muted">{weekdayLabel}</span></span>} title="今天">
    <div data-testid="home-portrait" className="space-y-4">
      {error ? <div role="alert" className="flex items-center justify-between rounded-xl border border-error/30 p-3 text-xs text-error"><span>{error}</span><button type="button" onClick={reload}>重试</button></div> : null}
      <HomeNoticeStrip />
      <div className="tactile flex items-center justify-between rounded-full bg-secondary px-3 py-1.5 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-accent-strong" />{"Intervals.icu"} {caption}{integration.data?.last_sync ? ` · 最近同步 ${new Date(integration.data.last_sync).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : null}</span><button type="button" onClick={() => void startSync()} disabled={syncing} className={`tactile flex min-h-11 items-center gap-1 px-1 text-accent-strong disabled:opacity-60 ${syncing ? "action-busy" : ""}`}><RefreshCw className="h-3.5 w-3.5" />{syncing ? "同步中" : "同步"}</button></div>
      {syncNote ? <p role="status" className="action-result text-caption1 text-muted-foreground">{syncNote}</p> : null}
      {!hasData ? <HomeSetupCard connection={connection} lastSync={integration.data?.last_sync ?? null} profile={profileQuery.profile} /> : <>
        <LovableTodayWorkout testId="home-workout" decision={decision} prescription={todayEvent?.workout_prescription ?? null} distanceM={todayEvent?.predicted_distance_m ?? null} linkedActivityId={todayEvent?.linked_activity_id ?? null} completed={todayActivity} />
        <section aria-label="恢复信号" data-testid="home-recovery"><LovableRecovery readiness={readiness} soreness={wellness.data[0]?.soreness ?? null} score={assessment.available ? readiness?.score ?? null : null} today={todayKey} conclusionTestId="home-decision" readingsTestId="home-readings" /></section>
        <TodayLoadCard points={pmc.data} />
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
