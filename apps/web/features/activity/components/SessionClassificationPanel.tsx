"use client";

import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { useSessionClassifications } from "@features/activity/hooks/useSessionClassifications";
import { qualityMetrics } from "@features/activity/lib/classification-metrics";

interface SessionClassificationPanelProps {
  activityId: string;
}

/** One-line course expression plus a group of stored quality metrics. */
export function SessionClassificationPanel({
  activityId,
}: SessionClassificationPanelProps) {
  const { byActivityId, loading, error } = useSessionClassifications();
  const item = byActivityId.get(activityId);
  if (loading) {
    return <Card padding="sm"><p className="text-caption1 text-text-muted">正在读取课程分类…</p></Card>;
  }
  if (error) {
    return <Card padding="sm"><p className="text-caption1 text-error">分类结果加载失败：{error}</p></Card>;
  }
  if (!item) {
    return <Card padding="sm"><p className="text-caption1 text-text-muted">这条活动暂无课程分类结果。</p></Card>;
  }
  const summary = item.session_classification;
  return (
    <Card padding="sm" data-testid="session-classification-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">{summary.display_name}</Badge>
        <span className="font-mono text-caption2 text-text-muted">
          {summary.structure} · {summary.primary_stimulus} · {summary.evidence_grade}
        </span>
      </div>
      <p className="mt-2 text-caption1 leading-relaxed text-text-primary" data-testid="session-display-line">
        {summary.display_line}
      </p>
      <div
        className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-caption1 text-text-secondary"
        data-testid="session-quality-metrics"
      >
        {qualityMetrics(item).map((text) => <span key={text}>{text}</span>)}
      </div>
    </Card>
  );
}
