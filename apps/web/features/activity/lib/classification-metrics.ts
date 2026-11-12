import type { SessionClassificationResponseOutput } from "@shared/api/generated/model";

export type SessionClassificationItem = SessionClassificationResponseOutput;

function metric(label: string, value: number | null | undefined): string {
  if (value == null) return `${label} 未记录`;
  return `${label} ${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export function qualityMetrics(item: SessionClassificationItem): string[] {
  const q = item.quality;
  const s = item.session_classification;
  return [
    `证据 ${s.evidence_grade}`,
    `置信度 ${s.confidence.toFixed(2)}`,
    metric("工作里程完成度", q.work_distance_match),
    metric("结构匹配", q.structure_match),
    metric("配速达成", q.pace_attainment),
    metric("工作配速波动", q.work_pace_cv),
    metric("恢复/工作", q.recovery_ratio),
  ];
}
