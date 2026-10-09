"use client";

// Analysis tab · 负荷适应 — hero PMC + judgment + diagnosis tiles.
// Range comes from page-level AnalysisRangeProvider.

import { useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { useDataState } from "@shared/lib/use-data-state";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { LinkButton } from "./AnalysisLink";
import { LoadHero } from "./LoadHero";
import {
  buildLoadDiagnosis,
  type LoadDiagnosisCard,
} from "./AnalysisLoadDiagnostics";
import { useAnalysisRange } from "../lib/analysis-range";

export function AnalysisLoad() {
  const { range } = useAnalysisRange();
  const { data, loading, error } = usePmcData(range.from, range.to);
  const { weeks, loading: weeksLoading } = useWeeklyProgress(
    range.from,
    range.to,
  );

  const diagnosis = useMemo(
    () => buildLoadDiagnosis(data, weeks),
    [data, weeks],
  );

  const loadState = useDataState({
    data: data.length > 0 ? data : null,
    error,
    isLoading: loading,
  });

  return (
    <div className="flex flex-col gap-4" data-testid="analysis-load-root">
      <LoadHero
        data={data}
        loading={loading}
        error={error}
        rangeFrom={range.from}
        rangeTo={range.to}
      />

      {diagnosis && (
        <Card padding="md" data-testid="analysis-load-judgment">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption1 font-medium text-text-muted">负荷</span>
            <h2
              className="font-mono text-title3 font-semibold tracking-tight text-text-primary sm:text-title2"
              data-testid="analysis-load-headline"
            >
              {diagnosis.headline}
            </h2>
          </div>
        </Card>
      )}

      {diagnosis && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="诊断" />
          <div
            className="grid gap-3 sm:grid-cols-2"
            data-testid="load-panels-grid"
          >
            {diagnosis.cards.map((card) => (
              <DiagnosisCard key={card.testId} card={card} />
            ))}
            <DiagnosisCard card={diagnosis.plannedActual} />
          </div>
        </section>
      )}

      {loadState === "source-empty" && !weeksLoading && (
        <EmptyState
          title="暂无训练负荷数据"
          description="当前区间无法判断趋势；导入训练活动后再生成负荷诊断。"
          action={
            <LinkButton href="/settings?section=data">打开数据来源</LinkButton>
          }
        />
      )}
    </div>
  );
}

function DiagnosisCard({ card }: { readonly card: LoadDiagnosisCard }) {
  const fill = toneFill(card.tone);
  return (
    <div
      data-testid={card.testId}
      title={card.detail}
      className="flex flex-col gap-2 rounded-xl bg-surface-overlay/55 px-4 py-3.5 tabular-nums"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption1 font-medium text-text-muted">{card.label}</p>
        <span
          className={`h-2.5 w-2.5 rounded-full ${toneDotClass(card.tone)}`}
          aria-hidden
        />
      </div>
      <p
        className={`font-mono text-title3 font-semibold tabular-nums ${toneTextClass(card.tone)}`}
      >
        {card.value}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={`h-full rounded-full ${toneBarClass(card.tone)}`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <span className="sr-only">{card.detail}</span>
    </div>
  );
}

function toneFill(tone: LoadDiagnosisCard["tone"]): number {
  switch (tone) {
    case "success":
      return 72;
    case "warning":
      return 55;
    case "error":
      return 88;
    case "accent":
    default:
      return 40;
  }
}

function toneBarClass(tone: LoadDiagnosisCard["tone"]): string {
  switch (tone) {
    case "accent":
      return "bg-accent";
    case "success":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "error":
      return "bg-error";
  }
}

function toneTextClass(tone: LoadDiagnosisCard["tone"]): string {
  switch (tone) {
    case "accent":
      return "text-accent-strong";
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "error":
      return "text-error";
  }
}

function toneDotClass(tone: LoadDiagnosisCard["tone"]): string {
  switch (tone) {
    case "accent":
      return "bg-accent";
    case "success":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "error":
      return "bg-error";
  }
}
