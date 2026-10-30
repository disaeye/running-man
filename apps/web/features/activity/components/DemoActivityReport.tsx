"use client";

import { useState } from "react";
import { groupStreams, type ActivityDetail } from "@shared/types/activity";
import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { getSportConfig } from "@shared/config/sport-config";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { useActivityAnalysis } from "@features/activity/hooks/useActivityAnalysis";
import { MultiStreamChart } from "@features/activity/components/MultiStreamChart";
import { GpsSection } from "@features/activity/components/GpsSection";
import { resolveGpsState } from "@features/activity/lib/activity-detail";
import { StrengthDetail } from "@features/activity/components/StrengthDetail";
import { StrengthSessionMetrics } from "@features/activity/components/StrengthSessionMetrics";
import { DemoActivityHero } from "@features/activity/components/DemoActivityHero";
import { DemoBiomechanicsGrid } from "@features/activity/components/DemoBiomechanicsGrid";
import { DemoZoneDistribution } from "@features/activity/components/DemoZoneDistribution";
import { DemoEffectivenessCard } from "@features/activity/components/DemoEffectivenessCard";
import { DemoSplitTable } from "@features/activity/components/DemoSplitTable";

/** 单次训练详情：力量训练与耐力运动分别呈现适用的读数和分析内容。 */
export function DemoActivityReport({ activityId }: { readonly activityId: string }) {
  const activityQuery = useActivityDetail(activityId);

  if (activityQuery.loading) {
    return (
      <Card padding="md">
        <p className="text-subheadline text-text-muted" role="status" aria-busy="true">
          正在加载这次训练…
        </p>
      </Card>
    );
  }

  const activity = activityQuery.data;
  if (!activity) {
    return (
      <Card padding="md">
        <LabelCaps>NO ACTIVITY</LabelCaps>
        <p className="mt-2 text-subheadline text-text-secondary">
          还没有可回顾的训练记录
        </p>
      </Card>
    );
  }

  const config = getSportConfig(activity.sport);
  if (config.isStrength) {
    return (
      <div className="space-y-4" data-testid="demo-activity-report">
        <StrengthSessionMetrics
          durationS={activity.duration_s}
          calories={activity.calories}
          avgHeartRate={activity.avg_hr}
          rpe={activity.rpe ?? null}
        />
        <StrengthDetail activityId={activityId} />
      </div>
    );
  }

  return <EnduranceActivityReport activityId={activityId} activity={activity} />;
}

function EnduranceActivityReport({
  activityId,
  activity,
}: {
  readonly activityId: string;
  readonly activity: ActivityDetail;
}) {
  const streamsQuery = useActivityStreams(activityId);
  const analysisQuery = useActivityAnalysis(activityId);
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const streamMap = groupStreams(streamsQuery.data);
  const analysis = analysisQuery.data;
  const config = getSportConfig(activity.sport);
  const pace = activity.avg_speed != null && activity.avg_speed > 0
    ? 1000 / activity.avg_speed
    : null;

  return (
    <div className="space-y-4" data-testid="demo-activity-report">
      <DemoActivityHero
        distanceM={activity.distance_m}
        durationS={activity.duration_s}
        paceSPerKm={pace}
        calories={activity.calories}
        completionPct={null}
        sportLabel={config.label}
      />
      <DemoBiomechanicsGrid
        biomechanics={analysis?.biomechanics ?? null}
        heartRate={{ avg: activity.avg_hr, max: activity.max_hr }}
        activeMetric={activeMetric}
        onSelectMetric={setActiveMetric}
        chartSlot={activeMetric ? <MultiStreamChart streams={streamMap} /> : null}
      />
      <DemoZoneDistribution
        residence={analysis?.zone_residence ?? []}
        dominantZone={analysis?.dominant_zone ?? null}
        thresholdHr={null}
      />
      <DemoEffectivenessCard
        decouplingPct={analysis?.summary?.decoupling_pct ?? null}
        trimp={activity.trimp ?? null}
        aerobicTe={activity.aerobic_te ?? null}
        anaerobicTe={activity.anaerobic_te ?? null}
      />
      <DemoSplitTable
        laps={analysis?.laps ?? []}
        fastestLapIndex={analysis?.fastest_lap_index ?? null}
      />
      {!streamsQuery.loading ? (
        <GpsSection gpsState={resolveGpsState(activity, streamMap)} streamMap={streamMap} />
      ) : null}
    </div>
  );
}
