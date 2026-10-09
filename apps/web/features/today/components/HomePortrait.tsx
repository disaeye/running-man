"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useActivities } from "@features/activity/hooks/useActivities";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useWellness } from "@features/health/hooks/useWellness";
import { useCoachContext } from "@features/today/hooks/useCoachContext";
import { computeRange } from "@shared/lib/format";
import { assessReadiness, isStaleData } from "@features/today/lib/readiness-presentation";
import { useClientDateLabel, useClientGreeting } from "@shared/lib/client-date";
import { HomeDecisionCard } from "./HomeDecisionCard";
import { HomeBodySignals } from "./HomeBodySignals";
import { HomePmcPulse } from "./HomePmcPulse";
import { WeeklyHorizonMatrix } from "./WeeklyHorizonMatrix";
import { HomeRecentTraining } from "./HomeRecentTraining";

const RECENT_DAYS = 7;
const TREND_DAYS = 30;

export function HomePortrait() {
  const range7d = useMemo(() => computeRange(RECENT_DAYS), []);
  const range30d = useMemo(() => computeRange(TREND_DAYS), []);

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
  const decisionError = [coachQuery.error, recent.error, pmc.error, wellness.error].find((v): v is string => Boolean(v)) ?? null;
  const reloadDecision = () => {
    coachQuery.reload();
    recent.reload();
    pmc.reload();
    wellness.reload();
  };

  const lastPmc = pmc.data.at(-1) ?? null;
  const latestWellness = wellness.data.at(-1);

  const sleepAvg7d = coachQuery.data?.recovery_signals?.sleep_avg_7d;
  const caveats = coachQuery.data?.missing_data_caveats ?? [];

  return (
    <div className="space-y-6 pb-12" data-testid="home-portrait">
      {/* 1. Integrated Hero Greeting */}
      <section className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-overlay/20 p-4 sm:p-6" aria-labelledby="home-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-caption1 font-medium text-text-muted">
              <span>{briefDate}</span>
              <span>·</span>
              <span>今日训练概览</span>
            </div>
            <h1 id="home-title" className="text-display-sm font-semibold tracking-tight text-text-primary sm:text-display-md">
              {firstName ? `${greeting} · ${firstName}` : greeting}
            </h1>
          </div>

          {/* Quick HUD */}
          <div className="flex items-center gap-2.5 sm:gap-3" aria-label="今日核心摘要">
            <div className="flex items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-overlay/70 px-3.5 py-2 backdrop-blur-md">
              <span className={`size-2 rounded-full ${assessment.available ? "bg-primary" : "bg-text-muted"}`} />
              <div>
                <span className="block text-caption1 text-text-muted">就绪状态</span>
                <span className="font-mono text-headline font-semibold text-text-primary">
                  {assessment.available ? `${Math.round(assessment.score)} 分` : "待评估"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-overlay/70 px-3.5 py-2 backdrop-blur-md">
              <span className="size-2 rounded-full bg-accent" />
              <div>
                <span className="block text-caption1 text-text-muted">近7日负荷</span>
                <span className="font-mono text-headline font-semibold text-text-primary">
                  {coachQuery.data?.recent_load?.d7_tss != null ? `${Math.round(coachQuery.data.recent_load.d7_tss)} TSS` : "--"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Bento Grid: Decision, Signals, Metrics, Week, Load, Recent */}
      <div className="bento">
        {/* Bento 1: Decision Card */}
        <HomeDecisionCard
          decision={decision}
          assessment={assessment}
          dataStale={dataStale}
          onReload={reloadDecision}
          error={decisionError}
        />

        {/* Bento 2: Load Metric Rail */}
        <div className="bento-metric-rail grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3" aria-label="训练负荷关键指标">
          <MetricTile
            label="CTL"
            sub="长期体能"
            value={lastPmc?.ctl != null ? lastPmc.ctl.toFixed(1) : "--"}
            status="体能基准"
            color="text-primary"
          />
          <MetricTile
            label="ATL"
            sub="短期疲劳"
            value={lastPmc?.atl != null ? lastPmc.atl.toFixed(1) : "--"}
            status="近期负荷"
            color="text-accent"
          />
          <MetricTile
            label="TSB"
            sub="竞技状态"
            value={lastPmc?.tsb != null ? (lastPmc.tsb > 0 ? `+${lastPmc.tsb.toFixed(1)}` : lastPmc.tsb.toFixed(1)) : "--"}
            status={getTsbStatusLabel(lastPmc?.tsb)}
            color={lastPmc?.tsb != null && lastPmc.tsb >= 0 ? "text-emerald-400" : "text-amber-400"}
          />
          <MetricTile
            label="ACWR"
            sub="急性/慢性比"
            value={lastPmc?.acwr != null ? lastPmc.acwr.toFixed(2) : "--"}
            status={getAcwrStatusLabel(lastPmc?.acwr)}
            color="text-text-primary"
          />
        </div>

        {/* Bento 3: Body Signals Panel */}
        <HomeBodySignals
          latestWellness={latestWellness}
          sleepAvg7d={sleepAvg7d}
          caveats={caveats}
          assessment={assessment}
        />

        {/* Bento 4: Weekly Horizon Matrix */}
        <div className="bento-week glass-surface flex flex-col justify-between rounded-2xl border border-border-subtle p-4 sm:p-6" aria-labelledby="week-heading">
          <div>
            <div className="flex items-center justify-between">
              <h2 id="week-heading" className="text-caption1 font-medium tracking-wide text-text-muted">
                本周训练轨迹
              </h2>
              <Link href="/calendar" className="focus-ring flex items-center gap-1 text-caption1 font-medium text-text-muted hover:text-text-primary">
                日历视图
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            <WeeklyHorizonMatrix />
          </div>
        </div>

        {/* Bento 5: Load Pulse */}
        <HomePmcPulse
          points={pmc.data}
          fallback={coachQuery.data?.recent_load ?? null}
        />

        {/* Bento 6: Recent Activities */}
        <div className="bento-recent glass-surface rounded-2xl border border-border-subtle p-4 sm:p-6">
          <HomeRecentTraining
            activities={recent.data}
            loading={recent.loading}
          />
        </div>
      </div>
    </div>
  );
}

function getTsbStatusLabel(tsb: number | null | undefined): string | undefined {
  if (tsb == null) return undefined;
  if (tsb > 5) return "状态充沛";
  if (tsb >= -10) return "平衡适应";
  if (tsb >= -30) return "有效超量";
  return "过度疲劳";
}

function getAcwrStatusLabel(acwr: number | null | undefined): string | undefined {
  if (acwr == null) return undefined;
  if (acwr >= 0.8 && acwr <= 1.3) return "最佳区间";
  if (acwr > 1.3 && acwr <= 1.5) return "负荷上升";
  if (acwr > 1.5) return "过载风险";
  return "负荷较低";
}

function MetricTile({
  label,
  sub,
  value,
  status,
  color,
}: {
  label: string;
  sub: string;
  value: string;
  status?: string;
  color: string;
}) {
  return (
    <div className="glass-surface flex flex-col justify-between rounded-xl border border-border-subtle p-3 sm:p-4 transition-transform duration-150 active:scale-95">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-caption1 font-semibold text-text-primary">{label}</span>
        <span className="text-caption1 text-text-muted">{sub}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-1.5">
        <span className={`font-mono text-title2 font-bold tracking-tight sm:text-title1 ${color}`}>
          {value}
        </span>
        {status && (
          <span className="truncate rounded-md bg-surface-overlay/80 px-1.5 py-0.5 text-caption2 font-medium text-text-secondary">
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
