"use client";

import { MetricStrip, type MetricStripItem } from "@shared/ui/MetricStrip";
import { Row, Section, SectionChart } from "@shared/ui/Section";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { PMCChart } from "@features/pmc/components/PMCChart";
import { zoneFor, type ZoneTone } from "@shared/lib/metric-zone";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import type { AnalysisPageTab } from "@shared/config/canonical-routes";
import { useAnalysisOverviewSummary } from "../lib/use-analysis-overview-summary";
import { ANALYSIS_PILLAR_META } from "../lib/analysis-pillars";
import { PeriodReading } from "./PeriodReading";

type OverviewTab = Extract<AnalysisPageTab, "load" | "performance" | "intensity">;

type AnalysisOverviewProps = {
  readonly onSelectTab?: (tab: OverviewTab) => void;
  readonly rangeLabel?: string;
};

/**
 * Overview = the verdict, the four numbers behind it, the load chart, one row
 * per pillar, and the period reading. The prose stays short; the numbers and
 * the risk colour carry the story.
 */
export function AnalysisOverview({ onSelectTab, rangeLabel }: AnalysisOverviewProps) {
  const view = useAnalysisOverviewSummary();
  const points = view.pmc as PmcPoint[];
  const latest = points.at(-1) ?? null;
  const d7 = points.slice(-7).reduce((sum, point) => sum + (point.tss ?? 0), 0);
  const tsbZone = zoneFor("tsb", latest?.tsb ?? null);

  const readings: MetricStripItem[] = [
    {
      label: "体能 CTL",
      value: latest?.ctl != null ? String(Math.round(latest.ctl)) : NO_VALUE,
      note: ctlTrend(points),
    },
    {
      label: "疲劳 ATL",
      value: latest?.atl != null ? String(Math.round(latest.atl)) : NO_VALUE,
    },
    {
      label: "状态 TSB",
      value: latest?.tsb != null ? String(Math.round(latest.tsb)) : NO_VALUE,
      note: tsbNote(tsbZone?.tone, tsbZone?.label),
    },
    {
      label: "近 7 天负荷",
      value: d7 > 0 ? String(Math.round(d7)) : NO_VALUE,
      unit: "TSS",
    },
  ];

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
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-caption1 font-medium ${toneForRisk(view.summary.risk)}`}
          data-testid="analysis-overview-risk-badge"
          data-risk={view.summary.risk}
        >
          {riskBadgeLabel(view.summary.risk)}
        </span>
      </div>

      <MetricStrip columns={4} testId="analysis-readings" items={readings} />

      <Section
        title="负荷趋势"
        action={<span className="text-caption1 text-text-muted">CTL · ATL · TSB</span>}
      >
        <SectionChart>
          <PMCChart data={points} showTitle={false} />
        </SectionChart>
      </Section>

      <Section title="四个方面" testId="analysis-pillars">
        {pillars.map((pillar) => (
          <Row
            key={pillar.pillarId}
            testId={`analysis-pillar-${pillar.pillarId}`}
            label={pillar.title}
            detail={pillar.verdict}
            chevron
            onClick={() => onSelectTab?.(pillar.tabId as OverviewTab)}
            trailing={
              <span
                className={`size-2 shrink-0 rounded-full ${
                  pillar.risk === "high"
                    ? "bg-error"
                    : pillar.risk === "medium"
                      ? "bg-warning"
                      : "bg-success"
                }`}
                aria-hidden="true"
              />
            }
          />
        ))}
      </Section>

      <PeriodReading
        loading={view.loading}
        error={view.error}
        points={points.map((point) => ({ ctl: point.ctl, tsb: point.tsb, tss: point.tss }))}
        pillars={pillars.map((pillar) => ({ title: pillar.title, verdict: pillar.verdict }))}
        rangeLabel={rangeLabel ?? "当前范围"}
      />

      {view.error != null && (
        <p className="text-caption1 text-error" role="alert">
          数据获取失败：{view.error}
        </p>
      )}
    </div>
  );
}

/**
 * TSB 的警戒态过去靠红色读数（`tone="attention"`）表达。`MetricStrip` 不做
 * 单格染色，颜色只留给下方「四个方面」的状态点，所以这里用契约里的分区名
 * （疲劳偏高 / 过载风险）把判断写成一行 note。
 */
function tsbNote(tone: ZoneTone | undefined, label: string | undefined): string | undefined {
  if (label == null) return undefined;
  return tone === "caution" || tone === "danger" ? label : undefined;
}

function ctlTrend(points: PmcPoint[]): string | undefined {
  const first = points[0]?.ctl;
  const last = points.at(-1)?.ctl;
  if (first == null || last == null) return undefined;
  const delta = Math.round((last - first) * 10) / 10;
  if (Math.abs(delta) < 0.5) return "本期基本持平";
  return `本期 ${delta > 0 ? "+" : ""}${delta}`;
}

function toneForRisk(risk: string): string {
  if (risk === "high") return "bg-error/10 text-error";
  if (risk === "medium") return "bg-warning/10 text-warning";
  return "bg-success/10 text-success";
}

function riskBadgeLabel(risk: string): string {
  if (risk === "high") return "风险偏高";
  if (risk === "medium") return "需要留意";
  return "风险低";
}
