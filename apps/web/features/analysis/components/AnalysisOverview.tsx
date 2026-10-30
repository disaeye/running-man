"use client";

import { Row, Section } from "@shared/ui/Section";
import { type AnalysisPageTab } from "@shared/config/canonical-routes";
import { useAnalysisOverviewSummary } from "../lib/use-analysis-overview-summary";
import { ANALYSIS_PILLAR_META } from "../lib/analysis-pillars";

type OverviewTab = Extract<AnalysisPageTab, "load" | "performance" | "intensity">;

type AnalysisOverviewProps = {
  readonly onSelectTab?: (tab: OverviewTab) => void;
};

/**
 * Overview = the training verdict and the next step, followed by performance pillars.
 */
export function AnalysisOverview({ onSelectTab }: AnalysisOverviewProps) {
  const view = useAnalysisOverviewSummary();
  const pillars = view.summary.pillars.map((pillar) => {
    const meta = ANALYSIS_PILLAR_META.find((entry) => entry.pillarId === pillar.pillarId);
    return { ...pillar, title: meta?.title ?? pillar.pillarId };
  });

  return (
    <div className="page-stack" data-testid="analysis-overview-inner">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-title3 font-semibold tracking-tight text-text-primary"
            data-testid="analysis-overview-verdict"
          >
            {view.summary.verdict}
          </h2>
          <p
            className="mt-2 max-w-2xl text-subheadline leading-relaxed text-text-secondary"
            data-testid="analysis-overview-next-step"
          >
            {view.summary.nextStep}
          </p>
          <p className="mt-1 text-caption1 text-text-muted" data-testid="analysis-overview-sample-line">
            {view.summary.sampleLine}
          </p>
        </div>
      </div>

      <Section title="四个方面" testId="analysis-pillars">
        {pillars.map((pillar) => (
          <Row
            key={pillar.pillarId}
            testId={`analysis-pillar-${pillar.pillarId}`}
            label={pillar.title}
            detail={pillar.verdict}
            chevron
            onClick={() => onSelectTab?.(pillar.tabId as OverviewTab)}
          />
        ))}
      </Section>

      {view.error != null && (
        <p className="text-caption1 text-error" role="alert">
          数据获取失败：{view.error}
        </p>
      )}
    </div>
  );
}
