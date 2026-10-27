"use client";

import { Badge } from "@shared/ui/Badge";
import { ScoreRing } from "@shared/ui/ScoreRing";
import { usePlanQuality } from "@features/plan/hooks/usePlanQuality";

type Grade = "A" | "B" | "C" | "D" | "F";

type GradeVariant = "success" | "warning" | "error" | "neutral";

interface GradeStyling {
  /** SVG stroke / inline color for ScoreRing — semantic token reference, no raw hex. */
  ringColor: string;
  badgeVariant: GradeVariant;
  label: string;
}

const GRADE_STYLING: Record<Grade, GradeStyling> = {
  A: { ringColor: "var(--color-success)", badgeVariant: "success", label: "优秀" },
  B: { ringColor: "var(--color-warning)", badgeVariant: "warning", label: "良好" },
  C: { ringColor: "var(--color-error)", badgeVariant: "error", label: "一般" },
  D: { ringColor: "var(--color-recovery-moderate)", badgeVariant: "neutral", label: "需改进" },
  F: { ringColor: "var(--color-error)", badgeVariant: "error", label: "不理想" },
};

const DEFAULT_RING_COLOR = "var(--color-text-muted)";

function gradeStyling(grade: Grade | null): { ringColor: string; badgeVariant: GradeVariant; label: string } {
  if (grade && grade in GRADE_STYLING) return GRADE_STYLING[grade];
  return { ringColor: DEFAULT_RING_COLOR, badgeVariant: "neutral", label: "" };
}

interface PlanQualityProps {
  readonly from?: string;
  readonly to?: string;
}

export function PlanQuality({ from, to }: PlanQualityProps) {
  const range = from && to ? { from, to } : undefined;
  const { data, loading, error } = usePlanQuality(range);

  if (loading) {
    return (
      <p className="text-caption1 text-text-muted" data-testid="plan-quality-loading">
        正在评估训练计划…
      </p>
    );
  }

  if (error || !data) {
    return (
      <p className="text-caption1 text-text-muted" data-testid="plan-quality-empty">
        {error ? "评分服务暂不可用" : "暂无评分数据，请先制定训练计划"}
      </p>
    );
  }

  const { ringColor, badgeVariant, label } = gradeStyling(data.grade);

  return (
    <div className="flex items-start gap-4" data-testid="plan-quality-card">
      <ScoreRing value={data.score} max={100} size={72} color={ringColor} ariaLabel={`计划评分 ${data.score}`}>
        <span className="font-mono text-title3 font-bold tabular-nums" style={{ color: ringColor }}>
          {Math.round(data.score)}
        </span>
      </ScoreRing>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-subheadline font-semibold text-text-primary">{label}</span>
          {data.grade && <Badge variant={badgeVariant}>{data.grade}</Badge>}
        </div>

        <p className="text-caption1 leading-snug text-text-secondary">{data.message}</p>

        <dl className="flex gap-6">
          <div>
            <dt className="text-caption1 text-text-muted">本周 TSS</dt>
            <dd className="font-mono text-subheadline font-semibold tabular-nums text-text-primary">
              {Math.round(data.weekly_tss)}
              <span className="text-caption1 font-normal text-text-muted">/{Math.round(data.target_tss)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-caption1 text-text-muted">关键训练</dt>
            <dd className="font-mono text-subheadline font-semibold tabular-nums text-text-primary">
              {data.key_sessions_completed}/{data.key_sessions_total}
            </dd>
          </div>
        </dl>

        {data.concerns.length > 0 && (
          <ul className="flex flex-col gap-1">
            {data.concerns.slice(0, 3).map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-caption1 text-text-secondary">
                <span className="mt-1 inline-flex size-1 shrink-0 rounded-full bg-warning" aria-hidden />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
