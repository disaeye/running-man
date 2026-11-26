"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageCard } from "@shared/ui/Card";
import { Tag } from "@shared/ui/Badge";
import { ScoreRing } from "@shared/ui/ScoreRing";
import { CountUp } from "@shared/ui/CountUp";
import type { CoachReadiness } from "@features/today/hooks/useCoachContext";
import { READINESS_LEVEL_COLOR, READINESS_LEVEL_LABEL } from "@features/today/lib/readiness-level";

const readScores = new Set<string>();

/**
 * 恢复信号：
 * 顶部紧凑 72px 就绪环 + 一句话恢复判定；下方为夜间睡眠、HRV、静息心率与酸痛度
 * 统一拍平的 4 项读数带，消除多余嵌套框与重复标注。
 */
export function LovableRecovery({ readiness, soreness, score, today, conclusionTestId, readingsTestId }: {
  readiness: CoachReadiness | null;
  soreness: number | null;
  score: number | null;
  today?: string;
  conclusionTestId?: string;
  readingsTestId?: string;
}) {
  const [factorsOpen, setFactorsOpen] = useState(false);
  const readings = readiness?.readings;
  const factors = readiness?.factors ?? [];
  const sleep = readings?.sleep_secs;
  const completeness = [readings?.hrv, readings?.resting_hr, sleep].filter((reading) => reading?.value != null).length + (soreness != null ? 1 : 0);
  const scoreKey = `${today ?? "current"}:${score ?? "none"}`;
  const animateScore = score != null && !readScores.has(scoreKey);
  if (score != null) readScores.add(scoreKey);
  const ringColor = readiness?.level ? READINESS_LEVEL_COLOR[readiness.level] : "var(--color-warn)";
  const levelLabel = readiness?.level ? READINESS_LEVEL_LABEL[readiness.level] : "暂未评估";

  return (
    <PageCard
      action={
        completeness < 4 ? (
          <Tag tone="warn">完整度 {completeness}/4</Tag>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3.5">
        <ScoreRing
          value={score ?? 0}
          max={100}
          size={72}
          strokeWidth={6}
          color={ringColor}
          ariaLabel={score != null ? `恢复就绪评分 ${score}` : "暂未评估"}
        >
          <span data-testid={conclusionTestId} className="num text-title2 font-bold text-text-primary">
            {score != null ? <CountUp value={score} animateOnMount={animateScore} durationMs={560} /> : "未记"}
          </span>
        </ScoreRing>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: ringColor }} aria-hidden="true" />
            <span className="text-title3 font-bold text-text-primary">{levelLabel}</span>
          </div>
        </div>
      </div>

      <div
        data-testid={readingsTestId}
        className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 sm:grid-cols-4 sm:gap-2"
      >
        <ReadingCell
          label="睡眠"
          value={sleep ? (sleep.value / 3600).toFixed(1) : undefined}
          baseline={sleep?.baseline != null ? `${(sleep.baseline / 3600).toFixed(1)} h` : undefined}
          observedOn={sleep?.observedOn}
          unit="h"
          today={today}
        />
        <ReadingCell
          label="HRV"
          reading={readings?.hrv}
          unit="ms"
          today={today}
        />
        <ReadingCell
          label="静息心率"
          reading={readings?.resting_hr}
          unit="bpm"
          today={today}
        />
        <ReadingCell
          label="酸痛度"
          value={soreness != null ? `${Math.round(soreness)}/4` : undefined}
          href="/calendar"
        />
      </div>

      <div className="mt-3 border-t border-border-subtle pt-2">
        <button
          type="button"
          aria-expanded={factorsOpen}
          onClick={() => setFactorsOpen((prev) => !prev)}
          className="focus-ring tactile flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-caption1 text-text-muted hover:text-text-primary"
        >
          <span>
            {factors.length > 0
              ? `影响因子（${factors.length} 项）`
              : "数据来源与测算说明"}
          </span>
          <ChevronDown className={`size-4 shrink-0 transition-transform ${factorsOpen ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {factorsOpen ? (
          <div className="mt-2 space-y-2">
            {factors.length > 0 ? (
              <ul className="divide-y divide-border-subtle rounded-xl bg-surface-overlay px-3 py-1">
                {factors.map((factor) => (
                  <li key={factor.name} className="flex items-center justify-between gap-2 py-1.5 text-caption1">
                    <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                      <span
                        aria-hidden
                        className={`size-1.5 shrink-0 rounded-full ${factor.impact === "neutral" ? "bg-text-muted" : "bg-info"}`}
                      />
                      <span className="break-words">{factor.detail || factor.name}</span>
                    </span>
                    <span className="shrink-0 text-text-muted">{factor.name}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-caption1 text-muted-foreground">
              睡眠与心率类指标来自 Intervals.icu 的健康数据同步；酸痛度在训练页手动记录；就绪分数由这些输入本地测算。
            </p>
          </div>
        ) : null}
      </div>
    </PageCard>
  );
}

function ReadingCell({
  label,
  reading,
  value,
  baseline,
  observedOn,
  unit,
  today,
  href,
}: {
  label: string;
  reading?: { value: number; baseline: number | null; observedOn?: string | null } | null;
  value?: string;
  baseline?: string;
  observedOn?: string | null;
  unit?: string;
  today?: string;
  href?: string;
}) {
  const effectiveObservedOn = observedOn ?? reading?.observedOn;
  const staleDay = effectiveObservedOn && today && effectiveObservedOn !== today ? effectiveObservedOn.slice(5) : null;
  const baselineFormatted =
    baseline ??
    (reading?.baseline != null
      ? `${Math.round(reading.baseline)}${unit ? ` ${unit}` : ""}`
      : null);
  const displayValue = value ?? (reading?.value != null ? Math.round(reading.value) : null);
  const hasDisplayValue = displayValue != null;
  const content = (
    <div className="flex h-full min-w-0 flex-col justify-between gap-1">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-caption1 text-text-muted">{label}</span>
        {href ? <ChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden /> : null}
      </div>
      <div
        className={`num font-mono tabular-nums ${
          !hasDisplayValue
            ? "text-subheadline font-medium text-text-muted"
            : "text-xl font-semibold text-text-primary"
        }`}
      >
        {hasDisplayValue ? displayValue : "未记录"}
        {hasDisplayValue && unit ? <span className="ml-0.5 font-sans text-caption1 font-normal text-text-muted">{unit}</span> : null}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-caption1 text-text-muted">
        {staleDay ? (
          <span className="num whitespace-nowrap font-mono tabular-nums">{staleDay}</span>
        ) : null}
        {baselineFormatted ? <span>{`基线 ${baselineFormatted}`}</span> : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="tactile focus-ring -m-1.5 flex h-full min-h-11 min-w-11 rounded-xl p-1.5 transition-colors hover:bg-surface-overlay"
      >
        {content}
      </Link>
    );
  }
  return <div className="flex h-full min-w-0">{content}</div>;
}
