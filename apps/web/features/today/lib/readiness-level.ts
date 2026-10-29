import { READINESS_BANDS_BY_LEVEL } from "@shared/config/generated/readiness-bands";
import type { ReadinessLevel } from "@features/today/hooks/useReadiness";

/**
 * 准备度档位的标签与颜色。
 *
 * 标签直接来自 `contracts/v1/readiness-bands.yaml`（经生成的登记表读入），
 * 所以首页、档案页与分析页对同一个档位的说法永远一致。
 *
 * `recovery` 停在中等色（橙）而不是塌到较差色（红）：「今天恢复」与
 * 「完全休息」是两件不同的事，页面上必须能分开。
 */

const BAND_COLOR: Record<string, string> = {
  good: "var(--color-recovery-good)",
  moderate: "var(--color-recovery-moderate)",
  poor: "var(--color-recovery-poor)",
};

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
