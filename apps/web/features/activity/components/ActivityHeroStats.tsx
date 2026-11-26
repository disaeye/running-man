"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PageCard } from "@shared/ui/Card";
import { Stat } from "@shared/ui/StatCell";
import { CountUp } from "@shared/ui/CountUp";
import { MetricHelpTip } from "@shared/ui/MetricHelpTip";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";

interface ActivityHeroStatsProps {
  readonly distanceM: number | null | undefined;
  readonly durationS: number | null | undefined;
  readonly paceSec: number | null;
  readonly avgHr: number | null | undefined;
  readonly maxHr: number | null | undefined;
  readonly gapPaceSec: number | null;
  readonly elevationGain: string;
  readonly caloriesVal: string;
  readonly cadenceSpm: number | null;
  readonly isRun: boolean;
}

/**
 * 活动详情 Hero 指标卡（对标 Garmin Connect / COROS 单次训练核心面板）：
 * L1 突出核心 4 项读数（距离焦点大字 + 用时 + 平均配速 + 平均心率），其余次级指标按需展开。
 */
export function ActivityHeroStats({
  distanceM,
  durationS,
  paceSec,
  avgHr,
  maxHr,
  gapPaceSec,
  elevationGain,
  caloriesVal,
  cadenceSpm,
  isRun,
}: ActivityHeroStatsProps) {
  const [moreStatsOpen, setMoreStatsOpen] = useState(false);

  return (
    <PageCard hero={true} className="h-full">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2">
        <div className="rounded-xl bg-surface-overlay p-3">
          <Stat
            label="距离"
            value={distanceM != null ? <CountUp value={distanceM / 1000} decimals={2} /> : NO_VALUE}
            unit={distanceM != null ? "km" : undefined}
            focal
          />
        </div>
        <div className="rounded-xl bg-surface-overlay p-3">
          <Stat label="用时" value={durationS != null ? formatDuration(durationS) : NO_VALUE} />
        </div>
        <div className="rounded-xl bg-surface-overlay p-3">
          <Stat label="平均配速" value={paceSec ? formatPaceFromSeconds(Math.round(paceSec)) : NO_VALUE} unit="/km" />
        </div>
        <div className="rounded-xl bg-surface-overlay p-3">
          <Stat
            label="平均心率"
            value={avgHr != null ? <CountUp value={Math.round(avgHr)} /> : NO_VALUE}
            unit="bpm"
          />
        </div>
      </div>

      <div className="mt-3 border-t border-border-subtle pt-2">
        <button
          type="button"
          aria-expanded={moreStatsOpen}
          onClick={() => setMoreStatsOpen((prev) => !prev)}
          className="focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-lg py-1.5 text-left text-caption1 text-text-muted hover:text-text-primary"
        >
          <span className="break-words">
            {moreStatsOpen
              ? "收起次级指标"
              : `更多指标（GAP · 爬升 · 最高心率 · ${isRun ? "步频" : "踏/划频"} · 卡路里）`}
          </span>
          <ChevronDown className={`size-4 shrink-0 transition-transform ${moreStatsOpen ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {moreStatsOpen ? (
          <div className="mt-2.5 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 lg:grid-cols-3">
              <div className="rounded-xl bg-surface-overlay p-2.5">
                <Stat label="GAP" termKey="GAP" value={gapPaceSec ? formatPaceFromSeconds(Math.round(gapPaceSec)) : NO_VALUE} unit="/km" />
              </div>
              <div className="rounded-xl bg-surface-overlay p-2.5">
                <Stat label="爬升" value={elevationGain} unit="m" />
              </div>
              <div className="rounded-xl bg-surface-overlay p-2.5">
                <Stat label="最高心率" value={maxHr != null ? Math.round(maxHr) : NO_VALUE} unit="bpm" />
              </div>
              <div className="rounded-xl bg-surface-overlay p-2.5">
                <Stat label={isRun ? "步频" : "踏/划频"} value={cadenceSpm != null ? Math.round(cadenceSpm) : NO_VALUE} unit={isRun ? "spm" : "rpm"} />
              </div>
              <div className="rounded-xl bg-surface-overlay p-2.5">
                <Stat label="卡路里" value={caloriesVal} unit="kcal" />
              </div>
            </div>
            {isRun ? (
              <div className="flex items-start gap-1 text-caption1 text-muted-foreground">
                <span>GAP 为坡度修正配速，步频为双脚合计</span>
                <MetricHelpTip label="步频与 GAP" text="GAP 将上下坡折算为平路等效配速；跑步步频已按双脚总步频统一展示。" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </PageCard>
  );
}
