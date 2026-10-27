/**
 * 月历格的负荷密度三档。
 *
 * 颜色只有一条来源：`--color-load-heatmap`（`chart-tokens` 里的 `loadHeatmap`）。
 * 档位靠透明度分，不引入第二组颜色。阈值沿用日历既有的 50 / 100 TSS 分界，
 * 只是把五档压成低 / 中 / 高三档，格子里放得下一条 3px 的条。
 */
export type LoadTier = "low" | "medium" | "high";

const MEDIUM_FROM = 50;
const HIGH_FROM = 100;

/** 没有负荷（`tss <= 0`）时返回 `null`：不画负荷条，也不标档位。 */
export function loadTier(tss: number): LoadTier | null {
  if (tss <= 0) return null;
  if (tss < MEDIUM_FROM) return "low";
  if (tss < HIGH_FROM) return "medium";
  return "high";
}

/** 格子里的负荷条与图例的色块共用这一份类名，两处永远同一档透明度。 */
export const LOAD_TIER_CLASS: Record<LoadTier, string> = {
  low: "bg-load-heatmap/30",
  medium: "bg-load-heatmap/60",
  high: "bg-load-heatmap",
};

export const LOAD_TIER_LABEL: Record<LoadTier, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export const LOAD_TIERS: readonly LoadTier[] = ["low", "medium", "high"];
