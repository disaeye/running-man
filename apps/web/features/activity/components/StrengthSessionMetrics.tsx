"use client";

import { Card } from "@shared/ui/Card";
import { MetricStrip, type MetricStripItem } from "@shared/ui/MetricStrip";
import { NO_VALUE } from "@shared/lib/use-data-state";

export function StrengthSessionMetrics({
  durationS,
  calories,
  avgHeartRate,
  rpe,
}: {
  readonly durationS: number | null;
  readonly calories: number | null;
  readonly avgHeartRate: number | null;
  readonly rpe: number | null;
}) {
  const readings: MetricStripItem[] = [
    { label: "训练时长", value: durationS == null ? NO_VALUE : formatDuration(durationS) },
    { label: "平均心率", value: avgHeartRate == null ? NO_VALUE : String(Math.round(avgHeartRate)), unit: avgHeartRate == null ? undefined : "BPM" },
    { label: "热量消耗", value: calories == null ? NO_VALUE : String(Math.round(calories)), unit: calories == null ? undefined : "KCAL" },
    { label: "自感用力度", value: rpe == null ? NO_VALUE : rpe.toFixed(1), unit: rpe == null ? undefined : "/10" },
  ];

  return (
    <Card padding="md" data-testid="strength-session-metrics">
      <h2 className="mb-3 text-caption1 font-semibold text-text-secondary">本次训练摘要</h2>
      <MetricStrip columns={4} items={readings} />
    </Card>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.round(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}
