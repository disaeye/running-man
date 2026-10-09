import { type ReactNode } from "react";
import { ScoreRing, type ScoreRingBand } from "./ScoreRing";

interface ReadinessRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  strokeOverride?: string;
  ariaLabel?: string;
  children?: ReactNode;
}

const TRAFFIC_LIGHT_BANDS: ScoreRingBand[] = [
  { min: 0, max: 55, color: "var(--color-recovery-poor)" },
  { min: 55, max: 75, color: "var(--color-recovery-moderate)" },
  { min: 75, max: 100, color: "var(--color-recovery-good)" },
];

function bandColorForScore(score: number): string {
  if (score >= 75) return "var(--color-recovery-good)";
  if (score >= 55) return "var(--color-recovery-moderate)";
  return "var(--color-recovery-poor)";
}

export function ReadinessRing({
  score,
  size = 88,
  strokeWidth = 7,
  strokeOverride,
  ariaLabel,
  children,
}: ReadinessRingProps) {
  const color = strokeOverride ?? bandColorForScore(score);
  return (
    <ScoreRing
      value={score}
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      bands={TRAFFIC_LIGHT_BANDS}
      ariaLabel={ariaLabel}
    >
      {children}
    </ScoreRing>
  );
}
