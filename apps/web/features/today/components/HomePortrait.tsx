"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useActivityAnalysis } from "@features/activity/hooks/useActivityAnalysis";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { useCoachContext } from "@features/today/hooks/useCoachContext";
import { useAbility } from "@features/today/hooks/useAbility";
import { usePersonalRange } from "@features/today/hooks/usePersonalRange";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import {
  athleteRange,
  athleteToday,
  athleteWeekRange,
  useAthleteTimezone,
} from "@shared/lib/training-day";
import { activityLocalDay } from "@shared/lib/training-day";
import { assessReadiness, decisionTitle } from "@features/today/lib/readiness-presentation";
import { freshnessCaption, hasHistory, type ConnectionState } from "@features/today/lib/freshness-caption";
import { useClientDateLabel, useHasMounted } from "@shared/lib/client-date";
import { DemoReadinessCard } from "./DemoReadinessCard";
import { DemoTodayWorkoutCard } from "./DemoTodayWorkoutCard";
import { DemoWeekVolumeCard } from "./DemoWeekVolumeCard";
import { DemoRecentActivityCard } from "./DemoRecentActivityCard";
import { DemoAbilityCard } from "./DemoAbilityCard";
import { HomeSetupCard } from "./HomeSetupCard";

const RECENT_DAYS = 30;

/**
 * 首页：按 stich_demo 的 home.html 重排。
 * 卡片顺序与参考稿一致：
 *   1. 今日就绪度与恢复评分
 *   2. 今日推荐训练（焦点行动卡）
 *   3. 本周训练里程进度环
 *   4. 最近一次训练
 *   5. 跑力生理负荷
 *
 * 取数只发生在这一层，卡片组件全部是纯展示：同一个 readiness 不会在两张卡
 * 上各请求一次然后各说各话。
 *
 * 每一张卡的数据都来自真实接口，没有的字段写「未记录」而不是编一个数字。
 */
export function HomePortrait() {
  const timezone = useAthleteTimezone();
  const mounted = useHasMounted();
  const weekRange = useMemo(() => athleteWeekRange(timezone), [timezone]);
  const todayKey = athleteToday(timezone);
  const weekStart = useMemo(
    () => new Date(`${weekRange.from}T00:00:00`),
    [weekRange.from],
  );
  const weekEnd = useMemo(() => {
    const [year, month, day] = weekRange.from.split("-").map(Number) as [number, number, number];
    const end = new Date(Date.UTC(year, month - 1, day + 6));
    return end.toISOString().slice(0, 10);
  }, [weekRange.from]);

  const profileQuery = useProfile();
  const coachQuery = useCoachContext();
  const integration = useSyncDetail("intervals_icu");
  // 本周的活动：周摘要与「今天的事件」用它。
  const weekActivities = useActivities(weekRange.from, weekEnd);
  // 最近一次训练：看最近 30 天，因为「最近一次」指的是上一次练，而不是
  // 本周最后一次——本周还没开练时它仍然是上一次。
  const recentRange = useMemo(() => athleteRange(RECENT_DAYS, timezone), [timezone]);
  const recent = useActivities(recentRange.from, recentRange.to);
  const weekEvents = useCalendarEvents(weekRange.from, weekEnd);
  const weekly = useWeeklyProgress();
  const ability = useAbility();
  const personalRange = usePersonalRange();
  const dateLabel = useClientDateLabel({ month: "long", day: "numeric", weekday: "long" });

  const readiness = coachQuery.data?.readiness ?? null;
  const assessment = assessReadiness(readiness);
  const decision = coachQuery.data?.recommendation ?? null;
  const asOf = coachQuery.data?.data_freshness?.activities?.data_as_of?.slice(0, 10) ?? null;

  const error =
    [coachQuery.error, weekActivities.error, recent.error, weekly.error].find(
      (value): value is string => Boolean(value),
    ) ?? null;

  const reload = () => {
    coachQuery.reload();
    weekActivities.reload();
    recent.reload();
    weekly.reload();
  };

  // 今天的事件：优先当天的那一个，没有就取最近的一条。
  const todayEvent = useMemo(() => {
    const withPrescription = weekEvents.events.filter((event) => event.workout_prescription);
    const today = withPrescription.find(
      (event) => activityLocalDay(event.start_time, timezone) === todayKey,
    );
    return today ?? withPrescription[0] ?? null;
  }, [weekEvents.events, timezone, todayKey]);

  // 最近一次训练：最近 30 天里的最后一次。
  const recentActivity = useMemo(() => {
    if (recent.data.length > 0) return recent.data[0] ?? null;
    return null;
  }, [recent.data]);

  // 最近一次训练的配速波动：只有活动分析接口算得出（它读的是速度流），
  // 所以只在知道是哪次训练之后才去取那一次的分析。
  const recentAnalysis = useActivityAnalysis(recentActivity?.activity_id);

  const hasData = hasHistory({
    asOf,
    activityCount: recent.data.length,
    wellnessCount: 0,
    pmcCount: weekly.currentWeek ? 1 : 0,
  });

  const firstName = profileQuery.profile?.name?.split(/\s+/)[0] ?? "";

  const connection: ConnectionState = integration.error
    ? "error"
    : integration.loading || !integration.data
      ? "loading"
      : integration.data.status === "connected"
        ? "connected"
        : "disconnected";
  const caption = freshnessCaption(asOf, connection);

  const conclusion = assessment.available
    ? (readiness?.recommendation ?? "")
    : decisionTitle(decision, assessment, { hasLoadHistory: weekly.currentWeek != null });

  const week = weekly.currentWeek;
  const weekLabel = mounted ? `第 ${isoWeekNumber(weekStart)} 周` : "";

  const readings = readiness?.readings ?? null;

  return (
    <div className="page-stack" data-testid="home-portrait">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-2 text-caption1 text-text-muted">
          <span>
            {dateLabel}
            {firstName ? ` · ${firstName}` : ""}
          </span>
          <span className="text-border-subtle" aria-hidden="true">
            ·
          </span>
          <span>{caption}</span>
        </div>
      </header>

      {error && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-caption1 text-error"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={reload}
            className="focus-ring flex items-center gap-1.5 rounded-lg border border-error/30 px-2.5 py-1 font-medium"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            重试
          </button>
        </div>
      )}

      {!hasData ? (
        <HomeSetupCard
          connection={connection}
          lastSync={integration.data?.last_sync ?? null}
          profile={profileQuery.profile}
        />
      ) : (
        <>
          {/* 1. 今日就绪度与恢复评分 */}
          <DemoReadinessCard
            conclusionTestId="home-decision"
            readingsTestId="home-readings"
            score={assessment.available ? readiness?.score ?? null : null}
            dataSufficient={assessment.available}
            levelLabel={assessment.levelLabel}
            conclusion={conclusion}
            readings={{
              resting_hr: readings?.resting_hr ?? null,
              sleep_secs: readings?.sleep_secs ?? null,
              hrv: readings?.hrv ?? null,
            }}
          />

          {/* 2. 今日推荐训练（焦点行动卡） */}
          <DemoTodayWorkoutCard
            testId="home-workout"
            decision={decision}
            prescription={todayEvent?.workout_prescription ?? null}
            todayLabel={dateLabel}
            linkedActivityId={todayEvent?.linked_activity_id ?? null}
          />

          {/* 3. 本周训练里程进度环 */}
          <DemoWeekVolumeCard
            actualDistanceM={week?.actual_distance_m ?? null}
            plannedDistanceM={
              week && week.planned_distance_m > 0 ? week.planned_distance_m : null
            }
            elevationM={week?.actual_elevation_m ?? null}
            avgPaceSPerKm={week?.avg_pace_s_per_km ?? null}
            weekLabel={weekLabel}
          />

          {/* 4. 最近一次训练 */}
          <DemoRecentActivityCard
            activity={recentActivity}
            paceVariationS={recentAnalysis.data?.pace_variation_s ?? null}
            relativeLabel={recentActivity ? formatRelative(recentActivity.start_time) : ""}
          />

          {/* 5. 跑力生理负荷 */}
          <DemoAbilityCard
            vdot={ability.data?.vdot ?? null}
            thresholdPaceSPerKm={ability.data?.threshold_pace_s_per_km ?? null}
            figures={personalRange.data?.figures ?? []}
            windowDays={personalRange.data?.window_days ?? 90}
          />
        </>
      )}
    </div>
  );
}

/**
 * ISO 周序号。
 *
 * ISO 周从周一开始，第 1 周是包含第一个周四的那一周。
 */
function isoWeekNumber(date: Date): number {
  const thursday = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayOfWeek = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - dayOfWeek + 3);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
  return (
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  );
}

/**
 * 相对时间标签：「昨晚 19:42」这样的中文写法。
 *
 * 用运动员自己的时区判断「昨天」，否则晚上八点的跑步在 UTC 服务器上
 * 可能还算前一天。
 */
function formatRelative(startTime: string): string {
  const moment = new Date(startTime);
  const now = new Date();
  const sameDay =
    moment.getFullYear() === now.getFullYear() &&
    moment.getMonth() === now.getMonth() &&
    moment.getDate() === now.getDate();
  const time = moment.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (sameDay) return `今天 ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    moment.getFullYear() === yesterday.getFullYear() &&
    moment.getMonth() === yesterday.getMonth() &&
    moment.getDate() === yesterday.getDate();
  if (isYesterday) return `昨晚 ${time}`;
  return `${moment.getMonth() + 1} 月 ${moment.getDate()} 日 ${time}`;
}
