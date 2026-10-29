// Pillar metadata used by both the analysis route tabs and overview
// navigation cards. Single source of truth for tab id ↔ display label ↔
// accessible name ↔ call-to-action wording.
//
// `ctaLabel` exists because two pillars share the `load` tab: the recovery
// card used to render `analysisTabLabel(tabId)` and read 负荷适应, so a card
// titled 恢复趋势 told the reader it led somewhere else.

import type { AnalysisPageTab } from "@shared/config/canonical-routes";

export interface AnalysisPillarMeta {
  readonly pillarId: "load" | "performance" | "intensity" | "recovery";
  readonly tabId: AnalysisPageTab;
  readonly title: string;
  readonly description: string;
  /** Wording of the card's navigation line, ending without the arrow. */
  readonly ctaLabel: string;
}

export const ANALYSIS_PILLAR_META: readonly AnalysisPillarMeta[] = [
  {
    pillarId: "load",
    tabId: "load",
    title: "负荷适应",
    description: "用 CTL / ATL / TSB 和 ACWR 看训练刺激是否被身体吸收。",
    ctaLabel: "看负荷适应",
  },
  {
    pillarId: "performance",
    tabId: "performance",
    title: "表现能力",
    description: "追踪最大摄氧量、阈值心率、阈值配速和比赛预测的长期变化。",
    ctaLabel: "看表现能力",
  },
  {
    pillarId: "intensity",
    tabId: "intensity",
    title: "强度结构",
    description: "检查各心率区间的时间分布和训练一致性，避免强度漂移。",
    ctaLabel: "看强度结构",
  },
  {
    pillarId: "recovery",
    tabId: "load",
    title: "恢复趋势",
    description: "睡眠、静息心率、心率变异和最近负荷的关系。",
    ctaLabel: "看恢复趋势",
  },
];

export const ANALYSIS_TAB_LABELS: Readonly<
  Record<AnalysisPageTab, string>
> = {
  session: "单次战报",
  overview: "总览",
  load: "负荷适应",
  performance: "表现能力",
  intensity: "强度结构",
};

export function analysisTabLabel(tab: AnalysisPageTab): string {
  return ANALYSIS_TAB_LABELS[tab];
}

export function analysisPillarMeta(
  pillarId: AnalysisPillarMeta["pillarId"],
): AnalysisPillarMeta | undefined {
  return ANALYSIS_PILLAR_META.find((meta) => meta.pillarId === pillarId);
}
