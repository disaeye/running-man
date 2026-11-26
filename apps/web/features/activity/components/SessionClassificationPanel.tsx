"use client";

import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { useSessionClassifications } from "@features/activity/hooks/useSessionClassifications";
import { qualityMetrics } from "@features/activity/lib/classification-metrics";

const STRUCTURE_LABELS: Record<string, string> = {
  steady: "稳态",
  steady_state: "稳态",
  continuous: "连续",
  intervals: "间歇",
  fartlek: "法特莱克",
  progressive: "渐进加速",
  race: "比赛",
  unknown: "未识别结构",
};

const STIMULUS_LABELS: Record<string, string> = {
  recovery: "主动恢复",
  aerobic_base: "有氧基础",
  aerobic_endurance: "有氧耐力",
  tempo: "节奏耐力",
  threshold: "乳酸阈值",
  vo2max: "最大摄氧量",
  anaerobic: "无氧能力",
  neuromuscular: "神经肌肉冲刺",
  mixed: "混合刺激",
};

interface SessionClassificationPanelProps {
  activityId: string;
}

export function SessionClassificationPanel({
  activityId,
  originalName = null,
}: SessionClassificationPanelProps & { originalName?: string | null }) {
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
  const structureLabel = STRUCTURE_LABELS[summary.structure] ?? summary.structure;
  const stimulusLabel = STIMULUS_LABELS[summary.primary_stimulus] ?? summary.primary_stimulus;
  return (
    <Card padding="sm" data-testid="session-classification-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">{summary.display_name}</Badge>
        <span className="text-caption1 text-text-muted">
          {structureLabel} · {stimulusLabel} · 证据 {summary.evidence_grade}
        </span>
      </div>
      <p className="mt-2 text-caption1 leading-relaxed text-text-primary" data-testid="session-display-line">
        {summary.display_line}
      </p>
      {originalName ? <p className="mt-2 text-caption1 text-text-muted">来源活动名称：{originalName}</p> : null}
      <div
        className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-caption1 text-text-secondary"
        data-testid="session-quality-metrics"
      >
        {qualityMetrics(item).map((text) => <span key={text}>{text}</span>)}
      </div>
    </Card>
  );
}
