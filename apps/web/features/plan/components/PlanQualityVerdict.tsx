"use client";

import { usePlanQuality } from "@features/plan/hooks/usePlanQuality";
import { gradeStyling } from "@features/plan/components/PlanQuality";

/**
 * 「计划质量评估」折叠态的单行结论：评级、关键训练完成度、周负荷达成率。
 * 折叠卡收起时也要携带信息，摘要句本身不再描述「里面有什么」。
 */
export function PlanQualityVerdict({ from, to }: { readonly from: string; readonly to: string }) {
  const { data, loading, error } = usePlanQuality({ from, to });
  if (loading) return <>正在评估…</>;
  if (error || !data) return <>暂无评分</>;
  const attainment = data.target_tss > 0 ? Math.round((data.weekly_tss / data.target_tss) * 100) : null;
  const parts = [
    gradeStyling(data.grade).label,
    `关键训练 ${data.key_sessions_completed}/${data.key_sessions_total}`,
    attainment != null ? `周负荷达成 ${attainment}%` : null,
  ].filter(Boolean);
  return <>{parts.join(" · ")}</>;
}
