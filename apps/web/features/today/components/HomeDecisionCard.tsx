"use client";

import Link from "next/link";
import { ArrowUpRight, Calendar, Clock, Flame, Zap } from "lucide-react";
import type { Assessment } from "@features/today/lib/readiness-presentation";
import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";
import {
  decisionReason,
  decisionTitle,
} from "@features/today/lib/readiness-presentation";

interface HomeDecisionCardProps {
  decision: CoachRecommendation | null;
  assessment: Assessment;
  dataStale: boolean;
  onReload: () => void;
  error: string | null;
}

export function HomeDecisionCard({
  decision,
  assessment,
  dataStale,
}: HomeDecisionCardProps) {
  const targetTss = decision?.target_tss ?? 0;
  const targetDurationMin = decision?.duration_min ?? 0;
  const targetIntensity = decision?.intensity ?? "low";

  const title = decisionTitle(decision, assessment);
  const reason = decisionReason(decision, assessment);

  const intensityColor =
    targetIntensity === "high"
      ? "text-error"
      : targetIntensity === "moderate"
        ? "text-warning"
        : "text-success";

  const intensityLabel =
    targetIntensity === "high"
      ? "高强度"
      : targetIntensity === "moderate"
        ? "中等强度"
        : "低强度";

  const hasPrescription = targetDurationMin > 0 || targetTss > 0;

  return (
    <article
      className="bento-decision glass-surface relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border-subtle p-4 sm:p-6"
      aria-labelledby="decision-heading"
    >
      <div className="space-y-4 sm:space-y-5">
        {/* Header line */}
        <div className="flex items-center justify-between gap-2">
          <h2 id="decision-heading" className="text-caption1 font-medium tracking-wide text-text-muted">
            今日训练安排
          </h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption2 font-medium ${
              !dataStale
                ? "bg-success/10 text-success"
                : "bg-warning/10 text-warning"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                !dataStale ? "bg-success" : "bg-warning"
              }`}
            />
            {!dataStale ? "已同步" : "已过期"}
          </span>
        </div>

        {/* Main Instruction */}
        <div>
          <h3 className="text-title1 font-semibold tracking-tight text-text-primary sm:text-largeTitle">
            {title}
          </h3>
          {reason && (
            <p className="mt-2 text-subheadline leading-relaxed text-text-secondary">
              {reason}
            </p>
          )}
        </div>

        {/* Action parameters: 3-column micro cards on both mobile & desktop */}
        {hasPrescription && (
          <div
            className="grid grid-cols-3 gap-2 sm:gap-3.5"
            data-testid="decision-prescription"
          >
            {/* Duration */}
            <div className="flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-overlay/50 p-2.5 sm:p-3.5">
              <div className="flex items-center gap-1.5 text-text-muted">
                <Clock className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-caption1 font-medium">时长</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-title3 font-semibold text-text-primary sm:text-title1">
                  {targetDurationMin}
                </span>
                <span className="text-caption1 text-text-muted">分钟</span>
              </div>
            </div>

            {/* Target Load */}
            <div className="flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-overlay/50 p-2.5 sm:p-3.5">
              <div className="flex items-center gap-1.5 text-text-muted">
                <Flame className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                <span className="text-caption1 font-medium">负荷</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-title3 font-semibold text-text-primary sm:text-title1">
                  ~{Math.round(targetTss)}
                </span>
                <span className="text-caption1 text-text-muted">TSS</span>
              </div>
            </div>

            {/* Intensity */}
            <div className="flex flex-col justify-between rounded-xl border border-border-subtle bg-surface-overlay/50 p-2.5 sm:p-3.5">
              <div className="flex items-center gap-1.5 text-text-muted">
                <Zap className={`size-3.5 shrink-0 ${intensityColor}`} aria-hidden="true" />
                <span className="text-caption1 font-medium">强度</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className={`whitespace-nowrap text-subheadline font-semibold sm:text-title2 ${intensityColor}`}>
                  {intensityLabel}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / CTA Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3.5 sm:mt-5">
        <span className="text-caption1 text-text-muted">
          {assessment.available ? `状态：${assessment.levelLabel}` : "待评估"}
        </span>
        <div className="flex items-center gap-2">
          <Link
            href="/calendar"
            className="focus-ring flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-caption1 font-medium text-text-secondary transition-all hover:bg-surface-overlay hover:text-text-primary active:scale-95"
          >
            <Calendar className="size-3.5" aria-hidden="true" />
            日历
          </Link>
          <Link
            href="/calendar?view=record"
            className="focus-ring flex min-h-[36px] items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-caption1 font-semibold text-on-primary shadow-sm transition-all duration-150 hover:bg-primary/90 active:scale-95"
          >
            前往执行
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
