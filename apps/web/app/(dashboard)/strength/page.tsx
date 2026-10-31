"use client";

import { Page, PageCard } from "@shared/ui/Lovable";
import { StrengthTabContent } from "@features/strength/components/StrengthTabContent";
import { MuscleVolumeChart } from "@features/strength/components/MuscleVolumeChart";
import { E1rmTable } from "@features/strength/components/E1rmTable";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";

export default function StrengthPage() {
  const analytics = useStrengthAnalytics();
  return <Page title="力量" eyebrow="训练记录"><StrengthTabContent /><PageCard title="肌群训练量"><MuscleVolumeChart data={analytics.muscleVolume} /></PageCard><PageCard title="估算最大力量"><E1rmTable data={analytics.e1rm} /></PageCard></Page>;
}
