"use client";

import { READINESS_BANDS_BY_LEVEL } from "@shared/config/generated/readiness-bands";
import { ScoreRing } from "@shared/ui/ScoreRing";
import type { ReadinessLevel } from "@features/today/hooks/useReadiness";

const BAND_COLOR: Record<string, string> = {
  good: "var(--color-recovery-good)",
  moderate: "var(--color-recovery-moderate)",
  poor: "var(--color-recovery-poor)",
};

// `recovery` stays on the moderate (orange) band instead of collapsing to
// poor (red), so the dashboard differentiates "recover today" from
// "full rest". This differs from bandForLevel() which maps both to poor.
const LEVEL_COLOR_OVERRIDE: Partial<Record<ReadinessLevel, string>> = {
  recovery: "var(--color-recovery-moderate)",
};

export const READINESS_LEVEL_LABEL = Object.fromEntries(
  (Object.entries(READINESS_BANDS_BY_LEVEL) as [ReadinessLevel, { label: string }][]).map(
    ([level, band]) => [level, band.label],
  ),
) as Record<ReadinessLevel, string>;

export const READINESS_LEVEL_COLOR = Object.fromEntries(
  (Object.entries(READINESS_BANDS_BY_LEVEL) as [ReadinessLevel, { color: string }][]).map(
    ([level, band]) => [level, LEVEL_COLOR_OVERRIDE[level] ?? BAND_COLOR[band.color]],
  ),
) as Record<ReadinessLevel, string>;

interface ReadinessHeroCardProps {
  score: number;
  level: ReadinessLevel;
}

/**
 * HIG hero card: the readiness state (label + score + ring + semantic color)
 * is the single dominant visual signal. No confidence, no data-source row,
 * no AI recommendation text. PMC chips and factor details are composed
 * outside this card by TodayStatusBar.
 */
export function ReadinessHeroCard({ score, level }: ReadinessHeroCardProps) {
  const rounded = Math.round(score);
  const ringColor = READINESS_LEVEL_COLOR[level];
  const levelLabel = READINESS_LEVEL_LABEL[level];
  const ringAriaLabel = `准备状态 ${rounded}/100, ${levelLabel}`;

  return (
    <div
      data-testid="readiness-hero"
      className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4.5 p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-xs hover:shadow-sm transition-all duration-200 overflow-hidden"
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full blur-2xl opacity-15"
        style={{ backgroundColor: ringColor }}
      />
      <div className="shrink-0">
        <ScoreRing
          value={score}
          size={84}
          strokeWidth={7}
          color={ringColor}
          ariaLabel={ringAriaLabel}
        >
          <span className="font-mono text-title1 font-bold tabular-nums leading-none text-text-primary">
            {rounded}
          </span>
        </ScoreRing>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-semibold text-text-muted">
          今日准备状态
        </p>
        <p
          data-testid="readiness-level-label"
          className="text-lg font-bold"
          style={{ color: ringColor }}
        >
          {READINESS_LEVEL_LABEL[level]}
        </p>
        <p className="text-xs leading-relaxed text-text-secondary">
          满分 100 · 综合评估睡眠质量、静息心率与近期负荷
        </p>
      </div>
    </div>
  );
}
