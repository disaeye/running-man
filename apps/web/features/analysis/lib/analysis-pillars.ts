// Pillar metadata used by both the analysis route tabs and overview
// navigation cards. Single source of truth for tab id ↔ display label ↔
// accessible name ↔ call-to-action wording.
//
// `ctaLabel` lets the recovery card name its destination while both analysis
// cards open the same tab.

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
    title: "跑量与训练安排",
    description: "查看近期跑步距离、训练次数与计划安排。",
    ctaLabel: "看跑量与训练安排",
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
    title: "恢复记录",
    description: "查看睡眠、静息心率和心率变异记录。",
    ctaLabel: "看恢复记录",
  },
];

export const ANALYSIS_TAB_LABELS: Readonly<
  Record<AnalysisPageTab, string>
> = {
  session: "跑步战报",
  strength: "力量训练",
  overview: "总览",
  load: "跑量与恢复",
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
