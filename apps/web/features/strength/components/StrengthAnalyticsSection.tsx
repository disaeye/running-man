"use client";

import { PageCard } from "@shared/ui/Card";
import type { DistributionItem, E1rmItem, MuscleVolumeItem } from "@shared/types/strength";
import { StrengthMuscleLoad } from "./StrengthMuscleLoad";
import { StrengthSquatTrend } from "./StrengthSquatTrend";
import { MuscleDistribution } from "./MuscleDistribution";
import { E1rmTable } from "./E1rmTable";

interface StrengthAnalyticsSectionProps {
  muscleVolume: readonly MuscleVolumeItem[];
  distribution: DistributionItem[];
  e1rm: E1rmItem[];
  currentSquatE1rm: number | null;
}

export function StrengthAnalyticsSection({
  muscleVolume,
  distribution,
  e1rm,
  currentSquatE1rm,
}: StrengthAnalyticsSectionProps) {
  const hasDistribution = distribution.some((item) => item.volume_kg > 0);
  return (
    <>
      <StrengthMuscleLoad data={muscleVolume} />
      {hasDistribution ? (
        <PageCard title="肌群训练量分布">
          <MuscleDistribution data={distribution} />
        </PageCard>
      ) : null}
      <StrengthSquatTrend e1rmHistory={e1rm} currentE1rm={currentSquatE1rm} />
      {e1rm.length > 0 ? (
        <PageCard title="历史预估 1RM">
          <E1rmTable data={e1rm} />
        </PageCard>
      ) : null}
    </>
  );
}
