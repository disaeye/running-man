"use client";

import { Card } from "@shared/ui/Card";
import { Sparkline } from "@shared/ui/Sparkline";
import { cn } from "@shared/lib/utils";
import { PMCChart } from "@features/pmc/components/PMCChart";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import type { AnalysisPageTab } from "@shared/config/canonical-routes";
import { useAnalysisOverviewSummary } from "../lib/use-analysis-overview-summary";
import {
  ANALYSIS_PILLAR_META,
  analysisTabLabel,
} from "../lib/analysis-pillars";

type OverviewTab = Extract<
  AnalysisPageTab,
  "load" | "performance" | "intensity"
>;

type AnalysisOverviewProps = {
  readonly onSelectTab?: (tab: OverviewTab) => void;
};

/**
 * Overview = short verdict + risk chip + 3 visual pillars + PMC.
 * Prose is minimal; charts and risk color carry the story.
 */
export function AnalysisOverview({ onSelectTab }: AnalysisOverviewProps) {
  const view = useAnalysisOverviewSummary();
  const verdictTone = toneForRisk(view.summary.risk);
  const tsbSpark = (view.pmc as PmcPoint[])
    .map((p) => p.tsb)
    .filter((v) => Number.isFinite(v));

  return (
    <div className="page-stack" data-testid="analysis-overview-inner">
      <Card padding="lg" className="relative overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2
              className="text-title1 font-semibold tracking-tight text-text-primary sm:text-display-sm"
              data-testid="analysis-overview-verdict"
            >
              {view.summary.verdict}
            </h2>
            <p className="sr-only" data-testid="analysis-overview-next-step">
              {view.summary.nextStep}
            </p>
            <p className="sr-only" data-testid="analysis-overview-sample-line">
              {view.summary.sampleLine}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-caption1 font-semibold",
                verdictTone,
              )}
              data-testid="analysis-overview-risk-badge"
              data-risk={view.summary.risk}
            >
              {riskBadgeLabel(view.summary.risk)}
            </span>
            {tsbSpark.length >= 2 && (
              <Sparkline
                data={tsbSpark.slice(-28)}
                variant="area"
                color="var(--color-tsb)"
                height={36}
                width={140}
                className="opacity-90"
              />
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-stretch gap-4 sm:gap-5 lg:grid-cols-3">
        {view.summary.pillars.map((pillar) => {
          const meta = ANALYSIS_PILLAR_META.find(
            (entry) => entry.pillarId === pillar.pillarId,
          );
          if (meta == null) return null;
          return (
            <PillarBentoCard
              key={pillar.pillarId}
              pillarId={pillar.pillarId}
              tabId={pillar.tabId as OverviewTab}
              title={meta.title}
              verdict={pillar.verdict}
              risk={pillar.risk}
              nextStep={pillar.nextStep}
              onNavigate={(tab) => onSelectTab?.(tab)}
            />
          );
        })}
      </div>

      <Card padding="md" aria-label="训练负荷">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-title3 font-semibold text-text-primary">PMC</h3>
          <span className="text-caption1 text-text-muted">CTL · ATL · TSB</span>
        </div>
        <PMCChart data={view.pmc as PmcPoint[]} />
      </Card>

      {view.error != null && (
        <Card
          padding="md"
          className="border-error/40 bg-error/5 text-footnote text-error"
        >
          数据获取失败
        </Card>
      )}
    </div>
  );
}

interface PillarBentoCardProps {
  readonly pillarId: string;
  readonly tabId: OverviewTab;
  readonly title: string;
  readonly verdict: string;
  readonly risk: "low" | "medium" | "high";
  readonly nextStep: string;
  readonly onNavigate: (tab: OverviewTab) => void;
}

function PillarBentoCard({
  pillarId,
  tabId,
  title,
  verdict,
  risk,
  nextStep,
  onNavigate,
}: PillarBentoCardProps) {
  return (
    <button
      type="button"
      className="group focus-ring flex h-full min-h-[8.5rem] w-full cursor-pointer flex-col text-left"
      data-testid={`analysis-pillar-${pillarId}`}
      data-pillar-id={pillarId}
      aria-label={`${title} — ${verdict}`}
      onClick={() => onNavigate(tabId)}
    >
      <Card
        padding="md"
        className="flex h-full flex-col gap-2 transition-colors group-hover:border-accent/35"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption1 font-medium text-text-muted">{title}</p>
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              risk === "high"
                ? "bg-error"
                : risk === "medium"
                  ? "bg-warning"
                  : "bg-success",
            )}
            data-risk={risk}
            aria-label={riskBadgeLabel(risk)}
          />
        </div>
        <h3
          className="text-title3 font-semibold leading-snug text-text-primary line-clamp-2"
          data-testid={`analysis-pillar-verdict-${pillarId}`}
        >
          {verdict}
        </h3>
        {/* next step kept for tests, visually secondary */}
        <p
          className="sr-only"
          data-testid={`analysis-pillar-next-step-${pillarId}`}
        >
          {nextStep}
        </p>
        <span className="text-caption1 font-medium text-accent-strong">
          {analysisTabLabel(tabId)} →
        </span>
      </Card>
    </button>
  );
}

function toneForRisk(risk: "low" | "medium" | "high"): string {
  if (risk === "high") return "bg-error/10 text-error";
  if (risk === "medium") return "bg-warning/10 text-warning";
  return "bg-success/10 text-success";
}

function riskBadgeLabel(risk: "low" | "medium" | "high"): string {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "观察";
  return "稳定";
}
