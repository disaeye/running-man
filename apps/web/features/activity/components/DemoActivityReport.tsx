"use client";

import { useState } from "react";
import { groupStreams } from "@shared/types/activity";
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
import { DemoActivityHero } from "@features/activity/components/DemoActivityHero";
import { DemoBiomechanicsGrid } from "@features/activity/components/DemoBiomechanicsGrid";
import { DemoZoneDistribution } from "@features/activity/components/DemoZoneDistribution";
import { DemoEffectivenessCard } from "@features/activity/components/DemoEffectivenessCard";
import { DemoSplitTable } from "@features/activity/components/DemoSplitTable";
import { useCoachContext } from "@features/today/hooks/useCoachContext";

/**
 * 单次训练战报（参考稿 analy.html 的主体）。
 *
 * 顺序与参考稿一致：
 *   1. 核心里程大卡
 *   2. 生物力学与动力学监测六格矩阵
 *   3. 心率五区间能量分配
 *   4. 运动效能评估与恢复建议
 *   5. 每公里逐段配速表
 *   6. GPS 轨迹
 *
 * 这一块被两个页面共用：活动详情页（`/activities/[id]`）与分析页的
 * 「单次战报」模式。两处显示的是同一场训练，内容必须完全一致，
 * 所以取数与排版都在这里。
 */
export function DemoActivityReport({
  activityId,
  showStrength = true,
}: {
  readonly activityId: string;
  /** 力量训练要不要显示力量训练明细。 */
  readonly showStrength?: boolean;
}) {
  const activityQuery = useActivityDetail(activityId);
  const streamsQuery = useActivityStreams(activityId);
  const analysisQuery = useActivityAnalysis(activityId);
  const coachQuery = useCoachContext();
  const [activeMetric, setActiveMetric] = useState<string | null>(null);

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

  const streamMap = groupStreams(streamsQuery.data ?? []);
  const analysis = analysisQuery.data;
  const config = getSportConfig(activity.sport);
  const pace =
    activity.avg_speed != null && activity.avg_speed > 0 ? 1000 / activity.avg_speed : null;

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

      {activity.sport === "WeightTraining" ? (
        showStrength ? (
          <StrengthDetail activityId={activityId} />
        ) : null
      ) : (
        <>
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
            tss={activity.tss}
            aerobicTe={activity.aerobic_te ?? null}
            anaerobicTe={activity.anaerobic_te ?? null}
            tsbRecoveryDays={
              coachQuery.data?.recovery_signals.tsb_recovery_days ?? null
            }
            tsb={coachQuery.data?.recent_load.current_tsb ?? null}
          />

          <DemoSplitTable
            laps={analysis?.laps ?? []}
            fastestLapIndex={analysis?.fastest_lap_index ?? null}
          />

          {!streamsQuery.loading ? (
            <GpsSection gpsState={resolveGpsState(activity, streamMap)} streamMap={streamMap} />
          ) : null}
        </>
      )}
    </div>
  );
}
