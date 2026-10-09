// Pillar metadata used by both the analysis route tabs and overview
// navigation cards. Single source of truth for tab id ↔ display label ↔
// accessible name mapping.

import type { AnalysisPageTab } from "@shared/config/canonical-routes";

export interface AnalysisPillarMeta {
  readonly pillarId: "load" | "performance" | "intensity" | "recovery";
  readonly tabId: AnalysisPageTab;
  readonly title: string;
  readonly description: string;
}

export const ANALYSIS_PILLAR_META: readonly AnalysisPillarMeta[] = [
  {
    pillarId: "load",
    tabId: "load",
    title: "负荷适应",
    description: "用 CTL / ATL / TSB 和 ACWR 看训练刺激是否被身体吸收。",
  },
  {
    pillarId: "performance",
    tabId: "performance",
    title: "表现能力",
    description: "追踪 VO₂max、FTP、LTHR、阈值配速和比赛预测的长期变化。",
  },
  {
    pillarId: "intensity",
    tabId: "intensity",
    title: "强度结构",
    description: "检查 Z1-Z5 时间分布和训练一致性，避免强度漂移。",
  },
  {
    pillarId: "recovery",
    tabId: "load",
    title: "恢复趋势",
    description: "睡眠、RHR、HRV、VO₂max 和最近负荷的关系。",
  },
];

export const ANALYSIS_TAB_LABELS: Readonly<
  Record<AnalysisPageTab, string>
> = {
  overview: "总览",
  load: "负荷适应",
  performance: "表现",
  intensity: "强度结构",
};

export function analysisTabLabel(tab: AnalysisPageTab): string {
  return ANALYSIS_TAB_LABELS[tab];
}
