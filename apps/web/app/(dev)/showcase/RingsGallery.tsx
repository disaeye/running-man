"use client";

import { ScoreRing } from "@shared/ui/ScoreRing";
import { Card } from "@shared/ui/Card";
import { ShowcaseHeading } from "./ShowcaseHeading";

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

export function RingsGallery() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <ShowcaseHeading title="ScoreRing" subtitle="All traffic-light bands" />
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
    </div>
  );
}
