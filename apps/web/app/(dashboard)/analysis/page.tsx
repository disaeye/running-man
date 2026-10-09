"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, Flame, LayoutDashboard, TrendingUp } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@shared/ui/tabs";
import { AnalysisLoad } from "@features/analysis/components/AnalysisLoad";
import { AnalysisRecovery } from "@features/analysis/components/AnalysisRecovery";
import { AnalysisAbility } from "@features/analysis/components/AnalysisAbility";
import { AnalysisIntensity } from "@features/analysis/components/AnalysisIntensity";
import { AnalysisOverview } from "@features/analysis/components/AnalysisOverview";
import { AnalysisRangeControls } from "@features/analysis/components/AnalysisRangeControls";
import {
  AnalysisRangeProvider,
  useAnalysisRange,
} from "@features/analysis/lib/analysis-range";
import { RecoveryCollapsible } from "@features/analysis/components/RecoveryCollapsible";
import {
  analysisTabUrl,
  canonicalAnalysisSearch,
  resolveAnalysisPageTab,
  type AnalysisPageTab,
} from "@shared/config/canonical-routes";

const TABS = [
  { id: "overview", label: "综合概览", icon: LayoutDashboard },
  { id: "load", label: "负荷与体能 (PMC)", icon: TrendingUp },
  { id: "intensity", label: "强度结构分布", icon: Flame },
  { id: "performance", label: "能力表现与预测", icon: Activity },
] as const;

type AnalysisTab = (typeof TABS)[number]["id"];

function parseTabParam(raw: string | null): AnalysisTab {
  return resolveAnalysisPageTab(raw) as AnalysisTab;
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
      <section className="flex flex-wrap items-end justify-between gap-6 border-b border-border-subtle pb-7" aria-labelledby="analysis-title">
        <div><p className="mb-2 font-mono text-caption2 uppercase tracking-[0.2em] text-text-muted">ATHLETE PERFORMANCE & METRICS</p><h1 id="analysis-title" className="text-display-md text-text-primary">训练分析</h1><p className="mt-2 max-w-xl text-subheadline text-text-secondary">追踪长期体能适应、疲劳平衡与各心率和配速区间分布。</p></div>
        <AnalysisRangeControls dateRange={range} onDateRangeChange={setRange} />
      </section>
      <Tabs value={tab} onValueChange={(value) => setTab(parseTabParam(value))} className="space-y-6">
        <div className="overflow-x-auto pb-1"><TabsList className="border border-border-default bg-surface-sunken/70 p-1">{TABS.map(({ id, label, icon: Icon }) => <TabsTrigger key={id} value={id} className="min-h-9 gap-2 rounded-md px-3 text-caption1"><Icon className="size-3.5" /><span>{label}</span></TabsTrigger>)}</TabsList></div>
        <TabsContent value="overview" className="space-y-6" data-testid="analysis-overview"><div className="glass-surface rounded-xl p-5 sm:p-7"><AnalysisOverview onSelectTab={setTab} /></div></TabsContent>
        <TabsContent value="load" forceMount className="space-y-6 data-[state=inactive]:hidden" data-testid="analysis-load-adaptation"><section aria-label="负荷适应诊断" className="space-y-6"><div className="glass-surface rounded-xl p-5 sm:p-7"><AnalysisLoad /></div><div className="glass-surface rounded-xl p-5 sm:p-7"><RecoveryCollapsible><AnalysisRecovery /></RecoveryCollapsible></div></section></TabsContent>
        <TabsContent value="intensity" forceMount className="space-y-6 data-[state=inactive]:hidden" data-testid="analysis-intensity"><div className="glass-surface rounded-xl p-5 sm:p-7"><AnalysisIntensity /></div></TabsContent>
        <TabsContent value="performance" forceMount className="space-y-6 data-[state=inactive]:hidden" data-testid="analysis-performance"><div className="glass-surface rounded-xl p-5 sm:p-7"><AnalysisAbility /></div></TabsContent>
      </Tabs>
    </div>
  );

}
