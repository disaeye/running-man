"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mutate } from "swr";
import { Page } from "@shared/ui/PageHeader";
import { apiFetch } from "@shared/lib/api";
import { isProductSport } from "@shared/config/sport-config";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { isJobActive, useSyncJob } from "@features/data/hooks/useSyncJobs";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { useCoachContext } from "@features/today/hooks/useCoachContext";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useWellness } from "@features/health/hooks/useWellness";
import { usePlanAdjustments } from "@features/goals/hooks/usePlanAdjustments";
import { useGoals } from "@features/goals/hooks/useGoals";
import { athleteRange, athleteToday, athleteWeekRange, useAthleteTimezoneState, activityLocalDay } from "@shared/lib/training-day";
import { assessReadiness } from "@features/today/lib/readiness-presentation";
import { freshnessCaption, hasHistory, type ConnectionState } from "@features/today/lib/freshness-caption";
import { addIsoDays, resolveTodayWorkoutState } from "@features/today/lib/home-readings";
import { useClientDateLabel } from "@shared/lib/client-date";
import { LovableTodayWorkout } from "./LovableTodayWorkout";
import { HomePendingAdjustmentBanner } from "./HomePendingAdjustmentBanner";
import { LovableRecovery } from "./LovableRecovery";
import { LovableWeekProgress } from "./LovableWeekProgress";
import { TodayLoadCard } from "./TodayLoadCard";
import { HomeSetupCard } from "./HomeSetupCard";
import { HomeSyncPill, jobProgressNote } from "./HomeSyncPill";
import { HomePortraitSkeleton } from "./HomePortraitSkeleton";

export function HomePortrait() {
  const { timezone, resolved } = useAthleteTimezoneState();
  const weekRange = useMemo(() => athleteWeekRange(timezone), [timezone]);
  const todayKey = athleteToday(timezone);
  const weekEnd = useMemo(() => addIsoDays(weekRange.from, 6), [weekRange.from]);
  const recentRange = useMemo(() => athleteRange(30, timezone), [timezone]);
  const profileQuery = useProfile();
  const coachQuery = useCoachContext();
  const integration = useSyncDetail("intervals_icu");
  const weekActivities = useActivities(resolved ? weekRange.from : "", resolved ? weekEnd : "");
  const recent = useActivities(resolved ? recentRange.from : "", resolved ? recentRange.to : "");
  const weekEvents = useCalendarEvents(resolved ? weekRange.from : "", resolved ? weekEnd : "");
  const pmc = usePmcData(resolved ? recentRange.from : "", resolved ? recentRange.to : "");
  const wellness = useWellness(resolved ? todayKey : "", resolved ? todayKey : "");
  const adjustments = usePlanAdjustments();
  const { goals } = useGoals();
  const primaryGoal = goals.find((goal) => goal.is_primary && goal.status === "active") ?? null;
  const [posting, setPosting] = useState(false);
  const [postNote, setPostNote] = useState<string | null>(null);
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
  const connection: ConnectionState = integration.error
    ? "error"
    : integration.loading || !integration.data
      ? "loading"
      : integration.data.status === "connected"
        ? "connected"
        : "disconnected";
  const caption = freshnessCaption(asOf, connection);
  const error = [
    coachQuery.error, weekActivities.error, weekEvents.error,
    recent.error, pmc.error, wellness.error, profileQuery.error,
  ].find((value): value is string => Boolean(value)) ?? null;
  const reload = useCallback(() => {
    void invalidateDataCards(mutate, "intervals_icu");
    profileQuery.reload();
  }, [profileQuery]);

  const trackedSettled = job != null && trackedJobId === job.id && !jobRunning;
  const syncNote = jobRunning && job
    ? jobProgressNote(job)
    : trackedSettled && job?.status === "success"
      ? `同步完成，已更新 ${job.activitiesUpserted} 条活动。`
      : trackedSettled && job?.status === "failed"
        ? (job.error ?? "同步失败，可在设置页查看详情。")
        : trackedSettled && job?.status === "cancelled"
          ? "同步已取消。"
          : postNote;

  const seenRunningRef = useRef<string | null>(null);
  useEffect(() => {
    if (!job) return;
    if (jobRunning) {
      seenRunningRef.current = job.id;
      return;
    }
    if (seenRunningRef.current !== job.id) return;
    seenRunningRef.current = null;
    if (job.status === "success") profileQuery.reload();
  }, [job, jobRunning, profileQuery]);

  const productRecent = useMemo(
    () => recent.data.filter((activity) => isProductSport(activity.sport)),
    [recent.data],
  );
  const todayActivities = useMemo(
    () => productRecent.filter((activity) => activityLocalDay(activity.start_time, timezone) === todayKey),
    [productRecent, timezone, todayKey],
  );
  const { todayEvent, completedToday, otherCompletedCount } = useMemo(
    () => resolveTodayWorkoutState(weekEvents.events, todayActivities, timezone, todayKey),
    [weekEvents.events, todayActivities, timezone, todayKey],
  );


  const hasData = hasHistory({ asOf, activityCount: productRecent.length, wellnessCount: wellness.data.length });
  const initialLoading = (!resolved || coachQuery.loading || recent.loading) && !hasData && !error;

  return (
    <div data-testid="home-portrait">
      <Page
        eyebrow={
          <span className="flex items-baseline gap-2">
            <span data-hydration-reveal className="num text-lg font-semibold tracking-tight text-text-secondary">{dateLabel}</span>
            <span data-hydration-reveal className="text-caption1 text-text-muted">{weekdayLabel}</span>
          </span>
        }
        title="今天"
        right={
          <HomeSyncPill
            connection={connection}
            caption={caption}
            lastSync={integration.data?.last_sync ?? null}
            syncing={syncing}
            onSync={() => void startSync()}
          />
        }
      >
        <div className="space-y-4">
          {error ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/5 p-3 text-caption1 text-error">
              <span>{error}</span>
              <button
                type="button"
                onClick={reload}
                className="focus-ring tactile inline-flex min-h-11 shrink-0 items-center rounded-full border border-error/40 px-3 text-caption1 font-medium text-error hover:bg-error/10"
              >
                重试
              </button>
            </div>
          ) : null}
          {syncNote ? <p role="status" className="action-result text-caption1 text-muted-foreground">{syncNote}</p> : null}

          {initialLoading ? (
            <HomePortraitSkeleton />
          ) : !hasData ? (
            <div className="content-arrival">
              <HomeSetupCard
                connection={connection}
                lastSync={integration.data?.last_sync ?? null}
                profile={profileQuery.profile}
                syncing={syncing}
                onSync={() => void startSync()}
              />
            </div>
          ) : (
            <div data-testid="home-dashboard" className="content-arrival grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-5">
              <div className="lg:col-span-7 lg:row-start-1">
                <LovableTodayWorkout
                  testId="home-workout"
                  goal={primaryGoal ? { name: primaryGoal.title, targetDate: primaryGoal.target_date } : null}
                  decision={decision}
                  prescription={todayEvent?.workout_prescription ?? null}
                  distanceM={todayEvent?.predicted_distance_m ?? null}
                  linkedActivityId={todayEvent?.linked_activity_id ?? null}
                  completed={completedToday}
                  otherCompletedCount={otherCompletedCount}
                />
              </div>
              <div className="space-y-4 lg:col-span-5 lg:col-start-8 lg:row-span-3 lg:row-start-1">
                <section aria-label="恢复信号" data-testid="home-recovery">
                  <LovableRecovery
                    readiness={readiness}
                    soreness={wellness.data[0]?.soreness ?? null}
                    score={assessment.available ? readiness?.score ?? null : null}
                    today={todayKey}
                    conclusionTestId="home-decision"
                    readingsTestId="home-readings"
                  />
                </section>
                <TodayLoadCard points={pmc.data} />
              </div>
              <div className="space-y-4 lg:col-span-7 lg:col-start-1 lg:row-start-2">
                <HomePendingAdjustmentBanner
                  adjustments={adjustments.data}
                  onDecided={() => {
                    adjustments.reload();
                    reload();
                  }}
                />
                <LovableWeekProgress
                  activities={weekActivities.data.filter((activity) => isProductSport(activity.sport))}
                  events={weekEvents.events}
                  timezone={timezone}
                  weekStart={weekRange.from}
                  todayKey={todayKey}
                />
  
              </div>
            </div>
          )}
        </div>
      </Page>
    </div>
  );
}
