"use client";

import Link from "next/link";
import { ArrowUpRight, Calendar, Clock, Flame, Gauge, Zap } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { MetricInlineDisclosure } from "@shared/ui/MetricInlineDisclosure";
import { ZoneMeter } from "@shared/ui/ZoneMeter";
import { termExplain } from "@shared/config/terms";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { zoneFor } from "@shared/lib/metric-zone";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { Assessment } from "@features/today/lib/readiness-presentation";
import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";
import { decisionTitle } from "@features/today/lib/readiness-presentation";

interface HomeDecisionCardProps {
  decision: CoachRecommendation | null;
  assessment: Assessment;
  dataStale: boolean;
  ctl: number | null;
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
 * The card holds a fixed set of elements whatever the data says: four
 * prescription slots and three evidence slots are always rendered, with a dash
 * where the value is missing. Explaining a metric happens in its `i` panel, not
 * in a sentence under the number — a paragraph that grows and shrinks with the
 * data also moves every block below it.
 */
export function HomeDecisionCard({
  decision,
  assessment,
  dataStale,
  ctl,
  tsb,
  d7Tss,
}: HomeDecisionCardProps) {
  const hasPrescription = decision !== null;
  const targetTss = decision?.target_tss ?? 0;
  const targetDurationMin = decision?.duration_min ?? 0;
  const intensity = INTENSITY[decision?.intensity ?? "low"] ?? INTENSITY.low!;
  const paceTargets = decision?.pace_targets ?? null;
  const tsbZone = zoneFor("tsb", tsb);

  const title = decisionTitle(decision, assessment);
  const pace = paceTargets
    ? `${formatPaceFromSeconds(paceTargets.min_s_per_km)}–${formatPaceFromSeconds(paceTargets.max_s_per_km)}`
    : NO_VALUE;

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

      <h3 className="mt-3 min-h-[2.25rem] text-display-sm font-semibold tracking-tight text-text-primary">
        {title}
      </h3>

      <div
        className="mt-4 flex min-h-[2.5rem] flex-wrap items-baseline gap-x-8 gap-y-3"
        data-testid="decision-prescription"
      >
        <Prescription
          icon={<Clock className="size-3.5" aria-hidden="true" />}
          label="时长"
          value={hasPrescription ? `${targetDurationMin}` : NO_VALUE}
          unit={hasPrescription ? "分钟" : undefined}
        />
        <Prescription
          icon={<Flame className="size-3.5" aria-hidden="true" />}
          label="目标负荷"
          value={hasPrescription ? `~${Math.round(targetTss)}` : NO_VALUE}
          unit={hasPrescription ? "TSS" : undefined}
        />
        <Prescription
          icon={<Zap className={`size-3.5 ${intensity.tone}`} aria-hidden="true" />}
          label="强度"
          value={hasPrescription ? intensity.label : NO_VALUE}
          tone={hasPrescription ? intensity.tone : "text-text-muted"}
        />
        <div className="flex items-baseline">
          <Prescription
            icon={<Gauge className="size-3.5" aria-hidden="true" />}
            label="配速"
            value={pace}
            unit={paceTargets ? "/km" : undefined}
          />
          <MetricInlineDisclosure label="配速" explanation={termExplain("THRESHOLD_PACE")} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-4">
        <Evidence label="就绪状态" term="RECOVERY_SCORE">
          <span className="font-mono text-title3 font-semibold tabular-nums text-text-primary">
            {assessment.available ? `${Math.round(assessment.score)}` : NO_VALUE}
          </span>
          <span className="ml-1.5 text-caption1 text-text-muted">
            {assessment.available ? assessment.levelLabel : "待建立基线"}
          </span>
        </Evidence>

        <Evidence label="CTL 体能" term="CTL">
          <span className="font-mono text-title3 font-semibold tabular-nums text-text-primary">
            {ctl == null ? NO_VALUE : ctl.toFixed(1)}
          </span>
        </Evidence>

        <Evidence label="TSB 训练压力平衡" term="TSB">
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
  term,
  children,
}: {
  label: string;
  term?: "TSB" | "CTL" | "RECOVERY_SCORE";
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center text-caption1 text-text-muted">
        {label}
        {term && (
          <MetricInlineDisclosure label={label} explanation={termExplain(term)} />
        )}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
