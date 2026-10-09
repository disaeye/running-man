"use client";

import { ScoreRing } from "@shared/ui/ScoreRing";
import { ReadinessRing } from "@shared/ui/ReadinessRing";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { Card } from "@shared/ui/Card";

const TRAFFIC_BANDS = [
  { min: 0, max: 55, color: "var(--color-recovery-poor)" },
  { min: 55, max: 75, color: "var(--color-recovery-moderate)" },
  { min: 75, max: 100, color: "var(--color-recovery-good)" },
];

const SCORE_RING_SAMPLES = [
  { value: 25, label: "Low (25%)" },
  { value: 50, label: "Mid (50%)" },
  { value: 75, label: "High (75%)" },
  { value: 100, label: "Full (100%)" },
];

const READINESS_SAMPLES: { score: number; label: string }[] = [
  { score: 30, label: "Recovery (30)" },
  { score: 55, label: "Moderate (55)" },
  { score: 80, label: "High (80)" },
  { score: 95, label: "Peak (95)" },
];

export function RingsGallery() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeader title="ScoreRing" subtitle="All traffic-light bands" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SCORE_RING_SAMPLES.map((s) => (
            <Card key={s.value} padding="sm" className="flex flex-col items-center gap-2">
              <ScoreRing value={s.value} bands={TRAFFIC_BANDS} ariaLabel={s.label}>
                <span className="text-callout font-bold text-text-primary">{s.value}</span>
              </ScoreRing>
              <span className="text-caption1 text-text-muted">{s.label}</span>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader title="ReadinessRing" subtitle="5 circles: bg + 3 bands + progress arc" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {READINESS_SAMPLES.map((s) => (
            <Card key={s.label} padding="sm" className="flex flex-col items-center gap-2">
              <ReadinessRing score={s.score} ariaLabel={s.label}>
                <span className="text-callout font-bold text-text-primary">{s.score}</span>
              </ReadinessRing>
              <span className="text-caption1 text-text-muted">{s.label}</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
