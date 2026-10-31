"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@shared/ui/tabs";
import { getSportConfig } from "@shared/config/sport-config";
import { PageHeader } from "@shared/ui/PageHeader";
import { AnalysisLoad } from "@features/analysis/components/AnalysisLoad";
import { AnalysisRecovery } from "@features/analysis/components/AnalysisRecovery";
import { AnalysisAbility } from "@features/analysis/components/AnalysisAbility";
import { AnalysisIntensity } from "@features/analysis/components/AnalysisIntensity";
import { AnalysisOverview } from "@features/analysis/components/AnalysisOverview";
import { AnalysisRangeControls } from "@features/analysis/components/AnalysisRangeControls";
import { DemoAnalysisSession } from "@features/analysis/components/DemoAnalysisSession";
import { StrengthSessionAnalysis } from "@features/analysis/components/StrengthSessionAnalysis";
import {
  AnalysisRangeProvider,
  useAnalysisRange,
} from "@features/analysis/lib/analysis-range";
import {
  analysisTabUrl,
  canonicalAnalysisSearch,
  resolveAnalysisPageTab,
  type AnalysisPageTab,
} from "@shared/config/canonical-routes";

// Tab wording matches ANALYSIS_TAB_LABELS and the pillar card titles, so one
// surface never calls the same thing by a different name.
const TABS = [
  { id: "load", label: "负荷与恢复" },
  { id: "performance", label: "能力与表现" },
  { id: "overview", label: "身体与生活" },
] as const;

type AnalysisTab = AnalysisPageTab;

function parseTabParam(raw: string | null): AnalysisTab {
  return resolveAnalysisPageTab(raw);
}

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <p className="text-sm text-muted-foreground animate-pulse">正在加载科学分析数据…</p>
        </div>
      }
    >
      <AnalysisRangeProvider>
        <AnalysisPageContent />
      </AnalysisRangeProvider>
    </Suspense>
  );
}

function AnalysisPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTabState] = useState<AnalysisTab>(() =>
    parseTabParam(searchParams.get("tab")),
  );
  const { range, setRange } = useAnalysisRange();
  const runningSportLabel = getSportConfig("Run").label;

  // Settle legacy aliases once on mount (ability → performance, etc.).
  useEffect(() => {
    const nextUrl = canonicalAnalysisSearch(searchParams, pathname);
    if (nextUrl !== null) router.replace(nextUrl, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only canonicalize
  }, []);

  const setTab = useCallback(
    (next: AnalysisTab | string) => {
      const resolved = parseTabParam(typeof next === "string" ? next : next);
      setTabState(resolved);
      const url = analysisTabUrl(resolved as AnalysisPageTab);
      router.replace(url, { scroll: false });
    },
    [router],
  );

  return (
    <div className="page-stack" data-testid="analysis-page">
      <PageHeader
        title={<span id="analysis-title">训练分析</span>}
        action={<AnalysisRangeControls dateRange={range} onDateRangeChange={setRange} />}
      />
      <Tabs value={tab} onValueChange={(value) => setTab(parseTabParam(value))} className="space-y-6" data-testid="analysis-tabs">
        <TabsList className="grid grid-cols-3">
          {TABS.map(({ id, label }) => (
            <TabsTrigger key={id} value={id} className="px-2 text-caption1 sm:px-3">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="session" className="space-y-6" data-testid="analysis-session">
          <DemoAnalysisSession sportLabel={runningSportLabel} />
        </TabsContent>
        <TabsContent value="strength" className="space-y-6" data-testid="analysis-strength">
          <StrengthSessionAnalysis />
        </TabsContent>
        <TabsContent value="overview" className="space-y-6" data-testid="analysis-overview">
          <AnalysisOverview onSelectTab={setTab} />
        </TabsContent>
        <TabsContent value="load" forceMount className="space-y-6 data-[state=inactive]:hidden" data-testid="analysis-load-adaptation">
          <section aria-label="负荷适应诊断" className="space-y-6">
            <AnalysisLoad />
            <AnalysisRecovery />
            <AnalysisIntensity />
          </section>
        </TabsContent>
        <TabsContent value="intensity" forceMount className="space-y-6 data-[state=inactive]:hidden" data-testid="analysis-intensity">
          <AnalysisIntensity />
        </TabsContent>
        <TabsContent value="performance" forceMount className="space-y-6 data-[state=inactive]:hidden" data-testid="analysis-performance">
          <AnalysisAbility />
        </TabsContent>
      </Tabs>
    </div>
  );
}
