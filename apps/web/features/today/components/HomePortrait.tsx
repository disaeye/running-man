"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useActivities } from "@features/activity/hooks/useActivities";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useWellness } from "@features/health/hooks/useWellness";
import { useCoachContext } from "@features/today/hooks/useCoachContext";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { assessReadiness, isStaleData } from "@features/today/lib/readiness-presentation";
import { useClientDateLabel, useClientGreeting } from "@shared/lib/client-date";
import { HomeDecisionCard } from "./HomeDecisionCard";
import { HomeBodySignals } from "./HomeBodySignals";
import { WeeklyHorizonMatrix } from "./WeeklyHorizonMatrix";
import { HomeRecentTraining } from "./HomeRecentTraining";

const RECENT_DAYS = 7;
const TREND_DAYS = 30;

/**
 * Today is a decision page: one answer, the evidence for it, then the context
 * needed to act on it. The evidence lives inside the answer block rather than
 * beside it, so the page has one thing to read first instead of six panels of
 * equal weight competing for the eye.
 */
export function HomePortrait() {
  // Anchored to the athlete's training day, not the host's. The calendar tab
  // already buckets by the athlete's zone, so a browser-local anchor here makes
  // the same session show up on two different days depending on which tab is
  // open.
  const timezone = useAthleteTimezone();
  const range7d = useMemo(() => athleteRange(RECENT_DAYS, timezone), [timezone]);
  const range30d = useMemo(() => athleteRange(TREND_DAYS, timezone), [timezone]);

  const profileQuery = useProfile();
  const coachQuery = useCoachContext();
  const recent = useActivities(range7d.from, range7d.to);
  const pmc = usePmcData(range30d.from, range30d.to);
  const wellness = useWellness(range30d.from, range30d.to);

  const briefDate = useClientDateLabel({ month: "long", day: "numeric" });
  const greeting = useClientGreeting();

  const athlete = profileQuery.profile;
  const firstName = athlete?.name?.split(/\s+/)[0] ?? "";

  const readiness = coachQuery.data?.readiness ?? null;
  const assessment = assessReadiness(readiness);
  const dataStale = isStaleData(coachQuery.data?.data_freshness?.activities?.staleness_bucket);

  const decision = coachQuery.data?.recommendation ?? null;
  const decisionError =
    [coachQuery.error, recent.error, pmc.error, wellness.error].find((value): value is string =>
      Boolean(value),
    ) ?? null;

  const reloadDecision = () => {
    coachQuery.reload();
    recent.reload();
    pmc.reload();
    wellness.reload();
  };

  const latestPmc = pmc.data.at(-1) ?? null;
  const rawTsb = latestPmc?.tsb ?? coachQuery.data?.recent_load?.current_tsb ?? null;
  // A TSB of 0 with no load history is the EWMA's zero seed, not a measurement.
  // The API already reports 负荷平衡 as a missing input in that state, so the
  // number is suppressed rather than presented as "balanced".
  const tsb = assessment.missingKeys.includes("tsb") ? null : rawTsb;
  const d7Tss =
    coachQuery.data?.recent_load?.d7_tss ??
    (pmc.data.length > 0
      ? pmc.data.slice(-RECENT_DAYS).reduce((total, point) => total + (point.tss ?? 0), 0)
      : null);

  const latestWellness = wellness.data.at(-1);
  const sleepAvg7d = coachQuery.data?.recovery_signals?.sleep_avg_7d;
  const caveats = coachQuery.data?.missing_data_caveats ?? [];

  // Nothing at all in the last 30 days: no sessions, no health records, and no
  // load history for the server to place a TSB in. An account in that state
  // used to get four missing-input warnings, two empty states, a "数据已过期"
  // badge and a zeroed week grid, with the only action at the bottom of the
  // page. It gets a starting point instead.
  const hasRecentData =
    recent.data.length > 0 || wellness.data.length > 0 || tsb !== null;

  return (
    <div className="page-stack" data-testid="home-portrait">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="min-w-0">
          <p className="text-caption1 text-text-muted">{briefDate}</p>
          <h1
            id="home-title"
            className="mt-1 text-display-sm font-semibold tracking-tight text-text-primary"
          >
            {firstName ? `${greeting} · ${firstName}` : greeting}
          </h1>
        </div>
        <Link
          href="/analysis"
          className="focus-ring flex items-center gap-1 text-caption1 font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          训练分析
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>

      {decisionError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-caption1 text-error"
          role="alert"
        >
          <span>{decisionError}</span>
          <button
            type="button"
            onClick={reloadDecision}
            className="focus-ring flex items-center gap-1.5 rounded-lg border border-error/30 px-2.5 py-1 font-medium"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            重试
          </button>
        </div>
      )}

      {!hasRecentData ? (
        <StartingPoint />
      ) : (
        <>
          <HomeDecisionCard
            decision={decision}
            assessment={assessment}
            dataStale={dataStale}
            tsb={tsb}
            d7Tss={d7Tss}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <HomeBodySignals
              latestWellness={latestWellness}
              sleepAvg7d={sleepAvg7d}
              caveats={caveats}
            />
            <Card padding="md" aria-labelledby="week-heading">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="week-heading" className="text-caption1 font-medium tracking-wide text-text-muted">
                  本周训练轨迹
                </h2>
                <Link
                  href="/calendar"
                  className="focus-ring flex items-center gap-1 text-caption1 font-medium text-text-muted transition-colors hover:text-text-primary"
                >
                  日历
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
              <WeeklyHorizonMatrix />
            </Card>
          </div>

          <Card padding="md">
            <HomeRecentTraining activities={recent.data} loading={recent.loading} />
          </Card>
        </>
      )}
    </div>
  );
}

/** What an account with no data in the last 30 days sees instead of the dashboard. */
function StartingPoint() {
  const steps = [
    {
      title: "连接数据源",
      body: "用 Intervals.icu 把历史活动、心率和睡眠同步进来。",
      href: "/settings?section=data",
      action: "去连接",
    },
    {
      title: "填写阈值",
      body: "最大心率、乳酸阈心率和阈值配速决定心率与配速区间。",
      href: "/settings?section=training",
      action: "去填写",
    },
    {
      title: "回来看今天的建议",
      body: "有数据之后，这里会给出今天该练什么、强度多少，以及为什么。",
      href: "/analysis",
      action: "了解分析",
    },
  ];

  return (
    <Card padding="lg" data-testid="home-starting-point">
      <h2 className="text-title2 font-semibold text-text-primary">最近 30 天还没有训练或健康记录</h2>
      <p className="mt-1.5 max-w-2xl text-subheadline leading-relaxed text-text-secondary">
        这个页面会回答问题「今天该做什么」。它需要一点数据才能开始。
      </p>
      <ol className="mt-5 flex flex-col gap-3 border-t border-border-subtle pt-4">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-caption1 text-text-muted">{index + 1}</span>
            <span className="text-subheadline font-medium text-text-primary">{step.title}</span>
            <span className="text-caption1 text-text-muted">{step.body}</span>
            <Link
              href={step.href}
              className="focus-ring ml-auto text-caption1 font-medium text-accent-strong underline-offset-4 hover:underline"
            >
              {step.action} →
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
