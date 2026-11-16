"use client";

import { useState } from "react";
import { groupStreams, type ActivityDetail } from "@shared/types/activity";
import { PageCard, Stat, Tag } from "@shared/ui/Lovable";
import { getSportConfig } from "@shared/config/sport-config";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { useActivityAnalysis, type ZoneResidence } from "@features/activity/hooks/useActivityAnalysis";
import { ActivityStreamCharts } from "@features/activity/components/ActivityStreamCharts";
import { ActivityKmSplits } from "@features/activity/components/ActivityKmSplits";
import { useActivityLaps } from "@features/activity/hooks/useActivityLaps";
import { GpsSection } from "@features/activity/components/GpsSection";
import { resolveGpsState } from "@features/activity/lib/activity-detail";
import { StrengthDetail } from "@features/activity/components/StrengthDetail";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { ActivityGearCard } from "@features/activity/components/ActivityGearCard";
import { ActivityLoadLevels } from "@features/activity/components/ActivityLoadLevels";

export function ActivityReport({ activityId }: { activityId: string }) {
  const query = useActivityDetail(activityId);
  if (query.loading) {
    return <p role="status" className="text-sm text-muted-foreground">正在加载这次训练…</p>;
  }
  if (!query.data) {
    return <PageCard><p className="text-sm text-muted-foreground">还没有可回顾的训练记录</p></PageCard>;
  }
  if (getSportConfig(query.data.sport).isStrength) {
    return <StrengthDetail activityId={activityId} />;
  }
  return <EnduranceReport activityId={activityId} activity={query.data} />;
}

function EnduranceReport({
  activityId,
  activity,
}: {
  activityId: string;
  activity: ActivityDetail;
}) {
  const streamsQuery = useActivityStreams(activityId);
  const analysisQuery = useActivityAnalysis(activityId);
  const laps = useActivityLaps(activityId);
  const [hoverTimeSec, setHoverTimeSec] = useState<number | null>(null);
  const streams = groupStreams(streamsQuery.data);
  const analysis = analysisQuery.data;

  const pace =
    activity.avg_speed && activity.avg_speed > 0
      ? 1000 / activity.avg_speed
      : null;
  const zones: ZoneResidence[] = analysis?.zone_residence ?? [];
  const totalZoneSeconds = Math.max(1, zones.reduce((sum, zone) => sum + zone.seconds, 0));
  const gpsState = resolveGpsState(activity, streams);

  const elevationGain =
    activity.elevation_gain_m != null
      ? Math.round(activity.elevation_gain_m).toString()
      : NO_VALUE;

  const caloriesVal =
    activity.calories != null
      ? Math.round(activity.calories).toString()
      : NO_VALUE;

  const thresholdDate = activity.start_time
    ? activity.start_time.slice(0, 10).replace(/-/g, "/")
    : null;

  const gapPace = readGapSpeedPace(activity.raw_data);
  const cadenceSpm =
    analysis?.biomechanics.avg_cadence_spm ??
    (activity.avg_cadence != null ? activity.avg_cadence * 2 : null);
  const rpe = activity.rpe ?? null;
  const tssValue = activity.tss ?? analysis?.summary?.tss ?? null;

  return (
    <div className="space-y-4" data-testid="demo-activity-report">
      {/* 渐变主卡片 */}
      <PageCard hero={true}>
        <div className="grid grid-cols-3 gap-y-4">
          <Stat label="距离" value={((activity.distance_m ?? 0) / 1000).toFixed(2)} unit="km" />
          <Stat label="用时" value={formatDuration(activity.duration_s ?? 0)} />
          <Stat label="平均配速" value={pace ? formatPaceFromSeconds(Math.round(pace)) : NO_VALUE} unit="/km" />

          <Stat label="GAP" value={gapPace ? formatPaceFromSeconds(Math.round(gapPace)) : NO_VALUE} unit="/km" sub="坡度修正配速" />
          <Stat label="爬升" value={elevationGain} unit="m" />
          <Stat label="卡路里" value={caloriesVal} unit="kcal" />

          <Stat label="平均心率" value={activity.avg_hr != null ? Math.round(activity.avg_hr) : NO_VALUE} unit="bpm" />
          <Stat label="最高心率" value={activity.max_hr != null ? Math.round(activity.max_hr) : NO_VALUE} unit="bpm" />
          <Stat label="步频" value={cadenceSpm != null ? Math.round(cadenceSpm) : NO_VALUE} unit="spm" />
        </div>
        <p className="mt-3 border-t border-border-subtle pt-2 text-caption1 text-muted-foreground">
          步频为双脚合计。
        </p>
      </PageCard>

      <ActivityLoadLevels
        activityId={activityId}
        intensityFactor={activity.intensity_factor ?? analysis?.summary?.if_val ?? null}
        trainingStress={tssValue}
        rpe={rpe}
        trimp={activity.trimp ?? null}
      />

      <div className="flex gap-2 text-caption1 text-muted-foreground">
        <Tag>{activity.device_name ?? "未知设备"}</Tag>
        <Tag>{activity.source}</Tag>
        <Tag>{activity.is_race ? "比赛" : "普通训练"}</Tag>
      </div>

      <PageCard title="路线">
        <GpsSection gpsState={gpsState} streamMap={streams} hoverTimeSec={hoverTimeSec} />
      </PageCard>

      <PageCard title="运动流">
        <ActivityStreamCharts
          streams={streams}
          onHoverTime={setHoverTimeSec}
          decouplingPct={analysis?.summary?.decoupling_pct ?? null}
          efficiencyFactor={
            analysis?.summary?.if_val != null && pace != null && analysis.summary.if_val > 0
              ? (1000 / pace) * analysis.summary.if_val
              : null
          }
        />
      </PageCard>

      <PageCard title="分段">
        <ActivityKmSplits
          streams={streams}
          laps={laps.laps}
          intervalSummary={readIntervalSummary(activity.raw_data)}
        />
      </PageCard>

      <PageCard
        title="心率区间分布"
        action={
          <Tag>{thresholdDate ? `阈值自 ${thresholdDate}` : "活动发生时阈值"}</Tag>
        }
      >
        {zones.length ? (
          <div className="space-y-2">
            {zones.map((zone) => {
              const rangeText = formatZoneRange(zone.min_bpm, zone.max_bpm);
              return (
                <div key={zone.zone} className="flex items-center gap-2 text-xs">
                  <span className="w-20 font-medium">
                    Z{zone.zone}{" "}
                    {rangeText ? (
                      <span className="font-normal text-muted-foreground">
                        {rangeText}
                      </span>
                    ) : null}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${zoneBarClass(zone.zone)}`}
                      style={{
                        width: `${Math.max(1, zone.pct)}%`,
                      }}
                    />
                  </div>
                  <span className="num w-10 text-right">
                    {Math.round(zone.seconds / 60)}m
                  </span>
                  <span className="num w-10 text-right text-muted-foreground">
                    {Math.round((zone.seconds / totalZoneSeconds) * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无区间数据</p>
        )}
      </PageCard>

      <ActivityGearCard activityId={activityId} activity={activity} />
    </div>
  );
}

function formatZoneRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}–${max}`;
  if (min == null && max != null) return `< ${max}`;
  if (min != null && max == null) return `≥ ${min}`;
  return "";
}

/**
 * 区间配色。
 *
 * Tailwind 只收集源码里原样出现的类名，`bg-z${zone}` 这种拼出来的字符串不会生成
 * CSS，进度条就变成透明的空条。
 */
function zoneBarClass(zone: number): string {
  switch (zone) {
    case 1:
      return "bg-z1";
    case 2:
      return "bg-z2";
    case 3:
      return "bg-z3";
    case 4:
      return "bg-z4";
    default:
      return "bg-z5";
  }
}

/** 来源系统在 raw_data 里给出的坡度修正速度（m/s），换算成配速 */
function readGapSpeedPace(raw: unknown): number | null {
  if (raw == null || typeof raw !== "object") return null;
  const gap = (raw as { gap?: unknown }).gap;
  return typeof gap === "number" && gap > 0.5 ? 1000 / gap : null;
}

/** 来源自己写的分组摘要，例如 ["1x 90s 137bpm", "21x 88s 164bpm"] */
function readIntervalSummary(raw: unknown): string[] {
  if (raw == null || typeof raw !== "object") return [];
  const summary = (raw as { interval_summary?: unknown }).interval_summary;
  if (!Array.isArray(summary)) return [];
  return summary.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}
