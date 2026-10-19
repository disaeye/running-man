"use client";

import Link from "next/link";
import { ArrowUpRight, Calendar, Clock, Flame, Gauge, Zap } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { ZoneMeter } from "@shared/ui/ZoneMeter";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { formatZoneRange, zoneFor } from "@shared/lib/metric-zone";
import { NO_VALUE } from "@shared/lib/use-data-state";
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
  tsb: number | null;
  d7Tss: number | null;
}

const INTENSITY: Readonly<
  Record<string, { readonly label: string; readonly tone: string }>
> = {
  high: { label: "高强度", tone: "text-zone-5" },
  moderate: { label: "中等强度", tone: "text-zone-4" },
  low: { label: "低强度", tone: "text-zone-2" },
  none: { label: "休息", tone: "text-text-muted" },
};

/**
 * The answer, and the three numbers that justify it.
 *
 * Today answers one question — what to do right now — so this is the only
 * block on the page that carries a heading of its own weight. The evidence
 * strip sits inside it rather than beside it: a readiness score, a TSB position
 * and a seven-day load mean something as support for a decision, and read as
 * three competing cards when they stand alone.
 */
export function HomeDecisionCard({
  decision,
  assessment,
  dataStale,
  tsb,
  d7Tss,
}: HomeDecisionCardProps) {
  const targetTss = decision?.target_tss ?? 0;
  const targetDurationMin = decision?.duration_min ?? 0;
  const intensity = INTENSITY[decision?.intensity ?? "low"] ?? INTENSITY.low!;

  const title = decisionTitle(decision, assessment);
  const reason = decisionReason(decision, assessment);
  const hasPrescription = targetDurationMin > 0 || targetTss > 0;
  const paceTargets = decision?.pace_targets ?? null;
  const tsbZone = zoneFor("tsb", tsb);

  return (
    <Card padding="lg" data-testid="home-decision">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-caption1 font-medium tracking-wide text-text-muted">
          今日训练安排
        </h2>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption1 ${
            dataStale
              ? "bg-warning/10 text-warning"
              : "bg-surface-overlay text-text-muted"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${dataStale ? "bg-warning" : "bg-recovery-good"}`}
            aria-hidden="true"
          />
          {dataStale ? "数据已过期" : "已同步"}
        </span>
      </div>

      <h3 className="mt-3 text-display-sm font-semibold tracking-tight text-text-primary">
        {title}
      </h3>
      {reason && (
        <p className="mt-2 max-w-2xl text-subheadline leading-relaxed text-text-secondary">
          {reason}
        </p>
      )}

      {hasPrescription && (
        <div
          className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-3"
          data-testid="decision-prescription"
        >
          <Prescription
            icon={<Clock className="size-3.5" aria-hidden="true" />}
            label="时长"
            value={`${targetDurationMin}`}
            unit="分钟"
          />
          <Prescription
            icon={<Flame className="size-3.5" aria-hidden="true" />}
            label="目标负荷"
            value={`~${Math.round(targetTss)}`}
            unit="TSS"
          />
          <Prescription
            icon={<Zap className={`size-3.5 ${intensity.tone}`} aria-hidden="true" />}
            label="强度"
            value={intensity.label}
            tone={intensity.tone}
          />
          {paceTargets && (
            <Prescription
              icon={<Gauge className="size-3.5" aria-hidden="true" />}
              label="配速"
              value={`${formatPaceFromSeconds(paceTargets.min_s_per_km)}–${formatPaceFromSeconds(paceTargets.max_s_per_km)}`}
              unit="/km"
            />
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-3">
        <Evidence label="就绪状态">
          <span className="font-mono text-title3 font-semibold tabular-nums text-text-primary">
            {assessment.available ? `${Math.round(assessment.score)}` : NO_VALUE}
          </span>
          <span className="ml-1.5 text-caption1 text-text-muted">
            {assessment.available ? assessment.levelLabel : "待建立基线"}
          </span>
        </Evidence>

        <Evidence label="TSB 训练压力平衡">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-title3 font-semibold tabular-nums text-text-primary">
              {tsb == null ? NO_VALUE : `${tsb > 0 ? "+" : ""}${tsb.toFixed(1)}`}
            </span>
            {tsbZone && (
              <span className="text-caption1 text-text-secondary">{tsbZone.label}</span>
            )}
          </div>
          <ZoneMeter metricKey="tsb" value={tsb} compact className="mt-2" />
        </Evidence>

        <Evidence label="近 7 日负荷">
          <span className="font-mono text-title3 font-semibold tabular-nums text-text-primary">
            {d7Tss == null ? NO_VALUE : Math.round(d7Tss)}
          </span>
          <span className="ml-1.5 text-caption1 text-text-muted">TSS</span>
        </Evidence>
      </div>

      {tsbZone && (
        <p className="mt-3 text-caption1 leading-relaxed text-text-muted">
          {tsbZone.label}（{formatZoneRange(tsbZone, 0)}）：{tsbZone.description}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-caption1 text-text-muted">
          {assessment.missing.length > 0
            ? `缺少${assessment.missing.join("、")}`
            : assessment.available
              ? "恢复数据完整"
              : "尚未评估"}
        </span>
        <div className="flex items-center gap-2">
          <Link
            href="/calendar"
            className="focus-ring flex min-h-9 items-center gap-1.5 rounded-lg border border-border-subtle px-3 text-caption1 font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            <Calendar className="size-3.5" aria-hidden="true" />
            日历
          </Link>
          <Link
            href="/calendar?view=record"
            className="focus-ring flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-caption1 font-semibold text-on-primary transition-colors hover:bg-primary-active"
          >
            前往执行
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Card>
  );
}

function Prescription({
  icon,
  label,
  value,
  unit,
  tone = "text-text-primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted">{icon}</span>
      <span className="text-caption1 text-text-muted">{label}</span>
      <span className={`font-mono text-title3 font-semibold tabular-nums ${tone}`}>
        {value}
      </span>
      {unit && <span className="text-caption1 text-text-muted">{unit}</span>}
    </div>
  );
}

function Evidence({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-caption1 text-text-muted">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
