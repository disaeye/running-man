import { METRIC_REGISTRY } from "@shared/config/generated/metric-registry";
import { zoneReference } from "@shared/lib/metric-zone";

/**
 * Training-load terms. The `reference` line for every banded metric is
 * generated from `contracts/v1/metrics.yaml`, so the glossary cannot drift from
 * the chips and charts that use the same bands.
 */
export const TERMS_LOAD = {
  TSS: {
    label: METRIC_REGISTRY.tss.display_name,
    explanation: {
      summary: "训练压力分数 (TSS) — 衡量单次训练对身体造成的累积压力。",
      reference: "100 = 1 小时全力训练",
      note: "基于 Coggan 模型，行业标准。"
    },
  },
  CTL: {
    label: METRIC_REGISTRY.ctl.display_name,
    explanation: {
      summary: "长期训练负荷 (CTL) — 42 天 TSS 的指数加权均值，代表长期累计体能。",
      reference: zoneReference("ctl", 0),
      note: "基于 PMC 模型，非直接体能测量。"
    },
  },
  ATL: {
    label: METRIC_REGISTRY.atl.display_name,
    explanation: {
      summary: "短期训练负荷 (ATL) — 7 天 TSS 的加权均值，代表近期疲劳程度。",
      reference: zoneReference("atl", 0),
      note: "7 天衰减基于行业惯例。"
    },
  },
  TSB: {
    label: METRIC_REGISTRY.tsb.display_name,
    explanation: {
      summary: "训练压力平衡 (TSB) — CTL 减 ATL，反映短期疲劳与长期体能的平衡。",
      reference: zoneReference("tsb", 0),
      note: "与 ACWR 可能给出相反信号：短期决策看 TSB，负荷变化速率看 ACWR。"
    },
  },
  ACWR: {
    label: METRIC_REGISTRY.acwr.display_name,
    explanation: {
      summary: "急慢性负荷比 (ACWR) — 7 天 EWMA 负荷与 28 天 EWMA 负荷的比值。",
      reference: zoneReference("acwr", 2),
      note: "对负荷变化的解释力在近年文献中存在争议，作为辅助参考。"
    },
  },
  NP: {
    label: METRIC_REGISTRY.normalized_power.display_name,
    explanation: {
      summary: "标准化功率 (NP) — 剔除起伏后的等效持续功率，更能反映真实强度。",
      reference: "单位 W",
      note: "行业标准强度指标。"
    },
  },
  IF: {
    label: "强度系数 (IF)",
    explanation: {
      summary: "标准化功率 ÷ FTP。",
      reference: "0.5 = 恢复 · 1.0 = 阈值 · > 1.1 = 无氧",
      note: "功率运动的核心相对强度指标。"
    },
  },
  FTP: {
    label: "功能性阈值功率 (FTP)",
    explanation: {
      summary: "你能持续 1 小时输出的最大功率。",
      reference: "单位 W",
      note: "骑行训练核心基准。"
    },
  },
  POWER: {
    label: "功率",
    explanation: {
      summary: "训练或比赛中实时输出的机械功率。",
      reference: "单位 W",
      note: "强度和效率分析的核心信号。"
    },
  },
} as const;
