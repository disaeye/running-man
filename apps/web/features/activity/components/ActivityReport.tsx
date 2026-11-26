"use client";

import { useState, type ReactNode } from "react";
import { groupStreams, type ActivityDetail } from "@shared/types/activity";
import { PageCard } from "@shared/ui/Card";
import { Segmented } from "@shared/ui/SegmentedControl";
import { Tag } from "@shared/ui/Badge";
import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { getSportConfig } from "@shared/config/sport-config";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { useActivityAnalysis, type ZoneResidence } from "@features/activity/hooks/useActivityAnalysis";
import { ActivityStreamCharts } from "@features/activity/components/ActivityStreamCharts";
import { ActivityKmSplits } from "@features/activity/components/ActivityKmSplits";
import { useActivityLaps } from "@features/activity/hooks/useActivityLaps";
import { GpsSection } from "@features/activity/components/GpsSection";
import { readGapSpeedPace, readIntervalSummary, resolveGpsState } from "@features/activity/lib/activity-detail";
import { useSplitSelection } from "@features/activity/lib/use-split-selection";
import { StrengthDetail } from "@features/activity/components/StrengthDetail";
import { StrengthSessionMetrics } from "@features/activity/components/StrengthSessionMetrics";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { ActivityGearCard } from "@features/activity/components/ActivityGearCard";
import { ActivityHeroStats } from "@features/activity/components/ActivityHeroStats";
import { ActivityLoadLevels } from "@features/activity/components/ActivityLoadLevels";
import { ActivityRaceToggle } from "@features/activity/components/ActivityRaceToggle";
import { ActivityWeatherCard } from "@features/activity/components/ActivityWeatherCard";
import { ActivityHrZonesCard } from "@features/activity/components/ActivityHrZonesCard";
import { ActivityDetailSkeleton } from "@features/activity/components/ActivityDetailSkeleton";

type DetailTab = "charts" | "splits";

const DETAIL_TABS: readonly { value: DetailTab; label: string }[] = [
  { value: "charts", label: "分析图表" },
  { value: "splits", label: "分段与区间" },
];

export function ActivityReport({
  activityId,
  classificationSlot,
}: {
  activityId: string;
  classificationSlot?: ReactNode;
}) {
  const query = useActivityDetail(activityId);
  if (query.loading) {
    return <ActivityDetailSkeleton />;
  }
  if (!query.data) {
    return <PageCard><p className="text-sm text-muted-foreground">还没有可回顾的训练记录</p></PageCard>;
  }
  if (getSportConfig(query.data.sport).isStrength) {
    const act = query.data;
    return (
      <div className="content-arrival space-y-4">
        <StrengthSessionMetrics
          durationS={act.duration_s}
          calories={act.calories}
          avgHeartRate={act.avg_hr}
          rpe={act.rpe ?? null}
        />
        <ActivityLoadLevels
          activityId={activityId}
          isStrength
          intensityFactor={act.intensity_factor ?? null}
          trainingStress={act.tss ?? null}
          rpe={act.rpe ?? null}
          trimp={act.trimp ?? null}
        />
        <StrengthDetail activityId={activityId} />
      </div>
    );
  }
  return (
    <EnduranceReport
      activityId={activityId}
      activity={query.data}
      onReload={query.reload}
      classificationSlot={classificationSlot}
    />
  );
}

function EnduranceReport({
  activityId,
  activity,
  onReload,
  classificationSlot,
}: {
  activityId: string;
  activity: ActivityDetail;
  onReload: () => void;
  classificationSlot?: ReactNode;
}) {
  const streamsQuery = useActivityStreams(activityId);
  const analysisQuery = useActivityAnalysis(activityId);
  const laps = useActivityLaps(activityId);
  const [detailTab, setDetailTab] = useState<DetailTab>("charts");
  const { hoverTimeSec, change, selectSplitTime } = useSplitSelection(setDetailTab);
  const streams = groupStreams(streamsQuery.data);
  const analysis = analysisQuery.data;

  const pace =
    activity.avg_speed && activity.avg_speed > 0
      ? 1000 / activity.avg_speed
      : null;
  const zones: ZoneResidence[] = analysis?.zone_residence ?? [];
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

  const sportCfg = getSportConfig(activity.sport);
  const gapPace = sportCfg.isRun ? readGapSpeedPace(activity.raw_data) : null;
  const rawCadence = analysis?.biomechanics.avg_cadence_spm;
  const fallbackCadence =
    activity.avg_cadence != null && activity.avg_cadence > 0
      ? sportCfg.isRun && activity.avg_cadence <= 130
        ? activity.avg_cadence * 2
        : activity.avg_cadence
      : null;
  const cadenceSpm = rawCadence ?? fallbackCadence;
  const rpe = activity.rpe ?? null;
  const tssValue = activity.tss ?? analysis?.summary?.tss ?? null;
  const efValue =
    activity.avg_speed != null && activity.avg_speed > 0 && activity.avg_hr != null && activity.avg_hr > 0
      ? (activity.avg_speed * 60) / activity.avg_hr
      : null;

  const weatherSummary =
    activity.weather != null
      ? [
          activity.weather.avg_temp != null ? `${Math.round(activity.weather.avg_temp)}°C` : null,
          activity.weather.wind_speed != null ? `风速 ${activity.weather.wind_speed.toFixed(1)} km/h` : null,
        ].filter(Boolean).join(" · ")
      : null;

  const heroStats = (
    <ActivityHeroStats
      distanceM={activity.distance_m}
      durationS={activity.duration_s}
      paceSec={pace}
      avgHr={activity.avg_hr}
      maxHr={activity.max_hr}
      gapPaceSec={gapPace}
      elevationGain={elevationGain}
      caloriesVal={caloriesVal}
      cadenceSpm={cadenceSpm}
      isRun={sportCfg.isRun}
    />
  );

  const loadLevels = (
    <ActivityLoadLevels
      activityId={activityId}
      intensityFactor={activity.intensity_factor ?? analysis?.summary?.if_val ?? null}
      trainingStress={tssValue}
      rpe={rpe}
      trimp={activity.trimp ?? null}
    />
  );

  const metaRow = (
    <div className="flex flex-wrap items-center justify-between gap-2 text-caption1 text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <Tag>{activity.device_name ?? "未知设备"}</Tag>
        {activity.source ? <Tag>{activity.source}</Tag> : null}
      </div>
      <ActivityRaceToggle
        activityId={activityId}
        isRace={Boolean(activity.is_race)}
        onDone={onReload}
      />
    </div>
  );

  return (
    <div className="content-arrival space-y-4" data-testid="demo-activity-report">
      {gpsState === "valid" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
          <div className="lg:col-span-6">{heroStats}</div>
          <div className="lg:col-span-6">
            <PageCard title="路线" className="h-full">
              <GpsSection gpsState={gpsState} streamMap={streams} hoverTimeSec={hoverTimeSec} />
            </PageCard>
          </div>
        </div>
      ) : (
        heroStats
      )}

      {classificationSlot ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-5">{classificationSlot}</div>
          <div className="lg:col-span-7">{loadLevels}</div>
        </div>
      ) : loadLevels}
      <div className="space-y-3">
        <div className="lg:hidden">
          <Segmented options={DETAIL_TABS} value={detailTab} onChange={setDetailTab} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          <div className={`${detailTab === "charts" ? "block" : "hidden"} view-swap space-y-4 lg:col-span-7 lg:block`}>
            {gpsState !== "valid" ? (
              <GpsSection gpsState={gpsState} streamMap={streams} hoverTimeSec={hoverTimeSec} />
            ) : null}
            <PageCard title="运动流">
              <ActivityStreamCharts
                streams={streams}
                hoverTimeSec={hoverTimeSec}
                onHoverTime={change}
                activityStartTime={activity.start_time}
                activityDurationS={activity.duration_s}
                decouplingPct={analysis?.summary?.decoupling_pct ?? null}
                efficiencyFactor={efValue}
              />
            </PageCard>
          </div>
          <div className={`${detailTab === "splits" ? "block" : "hidden"} view-swap space-y-4 lg:col-span-5 lg:block`}>
            <PageCard title="分段">
              <ActivityKmSplits
                streams={streams}
                laps={laps.laps}
                intervalSummary={readIntervalSummary(activity.raw_data)}
                onSelectTime={selectSplitTime}
              />
            </PageCard>
            <ActivityHrZonesCard zones={zones} thresholdDate={thresholdDate} />
          </div>
        </div>
      </div>

      {activity.weather != null || sportCfg.isRun ? (
        <DisclosureCard
          title="天气、装备与比赛标记"
          summary={[
            weatherSummary,
            activity.device_name ?? "未知设备",
            activity.is_race ? "比赛活动" : null,
            sportCfg.isRun ? "跑鞋关联" : null,
          ].filter(Boolean).join(" · ")}
        >
          <div className="space-y-4">
            {metaRow}
            {activity.weather != null ? <ActivityWeatherCard weather={activity.weather} /> : null}
            {sportCfg.isRun ? <ActivityGearCard activityId={activityId} activity={activity} /> : null}
          </div>
        </DisclosureCard>
      ) : metaRow}
    </div>
  );
}
