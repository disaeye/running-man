"use client";

import { PeriodReading } from "./PeriodReading";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import type { AnalysisTabId } from "@shared/config/canonical-routes";

/** 每个 tab 的支柱句：该 tab 图表里最重要的那个结论。 */
const PILLARS: Record<AnalysisTabId, { title: string; verdict: string }[]> = {
  load: [{ title: "强度结构", verdict: "对照下方心率区间分布，看高强度占比是否与恢复安排匹配。" }],
  performance: [{ title: "能力趋势", verdict: "阈值配速与 EF 的走向回答有氧基础是否在变好。" }],
  body: [{ title: "身体指标", verdict: "体重与体脂的变化要与负荷走势互相印证。" }],
};

/**
 * 「本期解读」容器：三个 tab 共用，拉当前时间范围的 PMC 序列交给
 * PeriodReading 的四态渲染。纯展示组件保持可测，数据装配集中在这里。
 */
export function PeriodReadingPanel({ tab, from, to }: {
  tab: AnalysisTabId;
  from: string;
  to: string;
}) {
  const pmc = usePmcData(from, to);
  return (
    <PeriodReading
      loading={pmc.loading}
      error={pmc.error}
      points={pmc.data}
      pillars={PILLARS[tab]}
      rangeLabel={`${from} 至 ${to}`}
    />
  );
}
