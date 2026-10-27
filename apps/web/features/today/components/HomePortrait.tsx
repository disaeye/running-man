"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useActivities } from "@features/activity/hooks/useActivities";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useWellness } from "@features/health/hooks/useWellness";
import { useCoachContext } from "@features/today/hooks/useCoachContext";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { useLifetimeTotals } from "@features/today/hooks/useLifetimeTotals";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { PMCChart } from "@features/pmc/components/PMCChart";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { buildWeekSummary, isoWeek } from "@features/calendar/lib/build-week-summary";
import {
  activityLocalDay,
  athleteRange,
  athleteToday,
  athleteWeekRange,
  useAthleteTimezone,
} from "@shared/lib/training-day";
import { assessReadiness, decisionTitle } from "@features/today/lib/readiness-presentation";
import { readinessFactorValues } from "@features/today/lib/readiness-factor-values";
import { gradeSnapshot, type GradeSnapshot } from "@features/today/lib/grade-label";
import { SAMPLE_DATA_ENABLED, SAMPLE_GRADE } from "@shared/dev/sample-data";
import { useAthleteGrade } from "@features/today/hooks/useAthleteGrade";
import { trainingStreak } from "@features/today/lib/training-streak";
import { useClientDateLabel, useHasMounted } from "@shared/lib/client-date";
import type { ActivitySummary } from "@shared/types/activity";
import { HomeSetupCard } from "./HomeSetupCard";
import { IdentityStrip } from "./IdentityStrip";
import { ReadinessCard } from "./ReadinessCard";
import { TodayWorkoutCard } from "./TodayWorkoutCard";
import { WeekCard } from "./WeekCard";

const RECENT_DAYS = 7;
const TREND_DAYS = 42;
/** 连续周数最多往回看半年：再长就不是「当前」连续了，是履历。 */
const STREAK_DAYS = 182;

/**
 * 首页：先答「我是谁、练了多少」，再答「今天该干什么」，最后才是趋势。
 *
 * 版面顺序固定，桌面 1024 以上两栏、手机单栏同序：
 * 元信息行 → 身份条 → 准备度 / 今日课表 → 本周 / 负荷趋势。
 *
 * 这一页只负责取数和排版，判断逻辑都在 `lib/` 里：分数可不可信
 * （`assessReadiness`）、连续了多少周（`trainingStreak`）、这一周的计划与实际
 * （`buildWeekSummary`）。取数只发生在这一层，卡片组件全部是纯展示，
 * 所以同一个 readiness 不会在两张卡上各请求一次然后各说各话。
 */
export function HomePortrait() {
  const timezone = useAthleteTimezone();
  const mounted = useHasMounted();
  const range7d = useMemo(() => athleteRange(RECENT_DAYS, timezone), [timezone]);
  const range42d = useMemo(() => athleteRange(TREND_DAYS, timezone), [timezone]);
  const rangeStreak = useMemo(() => athleteRange(STREAK_DAYS, timezone), [timezone]);
  const todayRange = useMemo(() => athleteRange(1, timezone), [timezone]);
  const weekRange = useMemo(() => athleteWeekRange(timezone), [timezone]);
  const weekStart = useMemo(() => new Date(`${weekRange.from}T00:00:00`), [weekRange.from]);

  const profileQuery = useProfile();
  const coachQuery = useCoachContext();
  // The same SWR entry the data page reads, so the two cannot disagree about
  // whether a source is connected.
  const integration = useSyncDetail("intervals_icu");
  const lifetime = useLifetimeTotals();
  const weekly = useWeeklyProgress(rangeStreak.from, rangeStreak.to);
  const recent = useActivities(range7d.from, range7d.to);
  const pmc = usePmcData(range42d.from, range42d.to);
  const wellness = useWellness(range42d.from, range42d.to);
  const grade = useAthleteGrade();
  const todayEvents = useCalendarEvents(todayRange.from, todayRange.to);
  const weekEvents = useCalendarEvents(weekRange.from, weekRange.to);
  const dateLabel = useClientDateLabel({ month: "long", day: "numeric", weekday: "long" });

  const readiness = coachQuery.data?.readiness ?? null;
  const assessment = assessReadiness(readiness);
  const decision = coachQuery.data?.recommendation ?? null;
  const asOf = coachQuery.data?.data_freshness?.activities?.data_as_of?.slice(0, 10) ?? null;

  // 因子格子印读数不印整句：接口的 detail 只留给悬停，数值在 lib 里自己算。
  const factorValues = readinessFactorValues({ wellness: wellness.data, pmc: pmc.data });
  // 没有真实等级时用示例顶上（`shared/dev/sample-data.ts`，脚手架，整块可删）：
  // 这里显式标成 `GradeSnapshot`，示例的字段形状对不上就是 tsc 报错。
  const measuredGrade = gradeSnapshot(grade.data);
  const gradeView: GradeSnapshot | null =
    measuredGrade ?? (SAMPLE_DATA_ENABLED ? SAMPLE_GRADE : null);
  const showingSampleGrade = measuredGrade === null && gradeView !== null;

  const error =
    [coachQuery.error, recent.error, pmc.error, wellness.error].find((value): value is string =>
      Boolean(value),
    ) ?? null;

  const reload = () => {
    coachQuery.reload();
    recent.reload();
    pmc.reload();
    wellness.reload();
  };

  // 本周的课表与实际：`athleteWeekRange` 是周一锚定的，所以「本周」在跨时区时
  // 也不会从某一天的边角上切过去。活动只取 7 天的那一条请求，
  // 再按运动员时区把它裁到周一起——同一个窗口不发第二次请求。
  const activityMap = useMemo(() => {
    const map = new Map<string, ActivitySummary[]>();
    for (const activity of recent.data) {
      const day = activityLocalDay(activity.start_time, timezone);
      if (day < weekRange.from || day > weekRange.to) continue;
      const bucket = map.get(day);
      if (bucket) bucket.push(activity);
      else map.set(day, [activity]);
    }
    return map;
  }, [recent.data, timezone, weekRange.from, weekRange.to]);
  const weekSummary = useMemo(
    () => buildWeekSummary({ events: weekEvents.events, activityMap, weekStart, timezone }),
    [weekEvents.events, activityMap, weekStart, timezone],
  );
  const weekActivitiesMissing = recent.loading || recent.error != null;
  const weekDistanceM = weekActivitiesMissing
    ? null
    : recent.data.reduce((sum, activity) => sum + (activity.distance_m ?? 0), 0);
  const weekElevationM = weekActivitiesMissing
    ? null
    : recent.data.reduce((sum, activity) => sum + (activity.elevation_gain_m ?? 0), 0);
  const weekLabel = mounted ? `第 ${isoWeek(weekStart).week} 周` : "";

  // 处方分段只有日历事件有；recommendation 只给一节课的总量。
  // 两天窗口里优先挑运动员今天的那个事件，别把昨晚的课当成今天的分段结构。
  const prescription = useMemo(() => {
    const todayKey = athleteToday(timezone);
    const withPrescription = todayEvents.events.filter((event) => event.workout_prescription);
    const todayEvent = withPrescription.find(
      (event) => activityLocalDay(event.start_time, timezone) === todayKey,
    );
    return (todayEvent ?? withPrescription[0])?.workout_prescription ?? null;
  }, [todayEvents.events, timezone]);

  const streak = weekly.weeks.length > 0 ? trainingStreak(weekly.weeks) : null;

  // `current_tsb` is always a number — it reads 0 on an account with no load
  // history — so it cannot be used as evidence that history exists. The PMC
  // points, the activity feed and the reported data date can.
  const hasHistory =
    asOf != null || recent.data.length > 0 || wellness.data.length > 0 || pmc.data.length > 0;

  const firstName = profileQuery.profile?.name?.split(/\s+/)[0] ?? "";

  const connection: "loading" | "error" | "connected" | "disconnected" = integration.error
    ? "error"
    : integration.loading || !integration.data
      ? "loading"
      : integration.data.status === "connected"
        ? "connected"
        : "disconnected";
  // The header states when the data stops, not that something is wrong. Data
  // being a few days old is the normal result of not training; calling it
  // expired puts an alarm on a quiet week. Broken syncing has its own state in
  // the shell indicator.
  const freshnessCaption = asOf
    ? `数据截至 ${asOf.slice(5)}`
    : connection === "connected"
      ? "已连接，等待首次同步"
      : connection === "disconnected"
        ? "未连接数据源"
        : connection === "error"
          ? "读不到数据源状态"
          : "正在读取数据源状态";

  // 分数是给人做决定的，所以先看分数可不可信：`data_sufficient` 为假时
  // 结论句说的是「测不到」，不是「状态一般」。
  const conclusion = assessment.available
    ? (readiness?.recommendation ?? "")
    : decisionTitle(decision, assessment, { hasLoadHistory: pmc.data.length > 0 });

  return (
    <div className="page-stack" data-testid="home-portrait">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-caption1 text-text-muted">
          {dateLabel}
          {firstName ? ` · ${firstName}` : ""}
        </p>
        <p className="text-caption1 text-text-muted">{freshnessCaption}</p>
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

      {!hasHistory ? (
        <HomeSetupCard
          connection={connection}
          lastSync={integration.data?.last_sync ?? null}
          profile={profileQuery.profile}
        />
      ) : (
        <>
          <IdentityStrip
            distanceM={lifetime.error ? null : lifetime.distance_m}
            sessionCount={lifetime.error ? null : lifetime.activity_count}
            streakWeeks={streak}
            readinessScore={readiness?.score ?? null}
            readinessLevel={readiness?.level ?? null}
            asOf={asOf}
            grade={gradeView}
            sampleGrade={showingSampleGrade}
            gradeReason={grade.data?.reason ?? null}
          />

          {/*
            两栏只对齐上沿，不拉平高度：行动卡没有处方的日子本来就短，
            让它长到和准备度卡一样高只会在下面留出一大片空白。
          */}
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
            <ReadinessCard
              score={readiness?.score ?? null}
              dataSufficient={assessment.available}
              conclusion={conclusion}
              asOf={asOf}
              factors={readiness?.factors ?? []}
              values={factorValues}
            />
            <TodayWorkoutCard decision={decision} prescription={prescription} todayLabel={dateLabel} />
          </div>

          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
            <WeekCard
              plannedTss={weekSummary.plannedTss}
              actualTss={weekSummary.actualTss}
              distanceM={weekDistanceM}
              elevationM={weekElevationM}
              sessions={weekSummary.completed}
              weekLabel={weekLabel}
              remainingTss={Math.max(0, weekSummary.plannedTss - weekSummary.actualTss)}
            />

            {/*
              `PMCChart` 自带 256/320px 画布和底部三个读数块，所以这里不再套
              `SectionChart` 的固定高度——套了就会把下半截截在卡外面。
            */}
            <Card data-testid="home-load">
              <CardHeader
                title="负荷趋势"
                trailing={<span className="text-caption1 text-text-muted">近 42 天</span>}
              />
              <PMCChart data={pmc.data} showTitle={false} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
