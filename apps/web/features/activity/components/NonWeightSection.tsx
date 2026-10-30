"use client";

import type { ActivityDetail as ActivityDetailType, StreamMap } from "@shared/types/activity";
import type { ActivityAnalysis } from "@features/activity/hooks/useActivityAnalysis";
import { useActivityLaps } from "@features/activity/hooks/useActivityLaps";
import { CoachDebrief } from "@features/activity/components/CoachDebrief";
import { MultiStreamChart } from "@features/activity/components/MultiStreamChart";
import { SegmentAnalysis } from "@features/activity/components/SegmentAnalysis";
import { LapAnalysis } from "@features/activity/components/LapAnalysis";
import { HrZoneDistribution } from "@features/activity/components/HrZoneDistribution";
import { GpsSection } from "@features/activity/components/GpsSection";
import { AerobicDecouplingCard } from "@features/activity/components/AerobicDecouplingCard";
import { resolveGpsState } from "@features/activity/lib/activity-detail";

export function NonWeightSection({
  activity,
  streamMap,
  analysis,
}: {
  activity: ActivityDetailType;
  streamMap: StreamMap;
  analysis: ActivityAnalysis | null;
}) {
  const gpsState = resolveGpsState(activity, streamMap);
  const isRun =
    activity.sport === "Run" ||
    activity.sport === "TrailRun" ||
    activity.sport === "VirtualRun";
  const { data: deviceLaps } = useActivityLaps(activity.activity_id);
  const algorithmLaps = analysis?.laps ?? [];
  const laps = deviceLaps.length > 0 ? deviceLaps : algorithmLaps;
  const lapSource = deviceLaps.length > 0 ? "device" : algorithmLaps.length > 0 ? "derived" : "none";

  return (
    <>
      <CoachDebrief activity={activity} streams={streamMap} />
      <AerobicDecouplingCard
        summary={analysis?.summary ?? null}
        showEmpty={isRun}
      />
      <GpsSection gpsState={gpsState} streamMap={streamMap} />
      <MultiStreamChart streams={streamMap} />
      <SegmentAnalysis streams={streamMap} />
      {(laps.length > 0 || analysis) && (
        <LapAnalysis laps={laps} source={lapSource} />
      )}
      {analysis && (
        <>
          <HrZoneDistribution zones={analysis.hr_zones ?? null} />
        </>
      )}
    </>
  );
}
