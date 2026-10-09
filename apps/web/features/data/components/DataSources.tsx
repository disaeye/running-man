"use client";

import { useState } from "react";
import { Skeleton } from "@shared/ui/Skeleton";
import { useIntegrations } from "@features/data/hooks/useIntegrations";
import { IntervalsSourceCard } from "./IntervalsSourceCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@shared/ui/tabs";
import { SyncStatusOverview } from "./SyncStatusOverview";
import { SyncHistoryList } from "./SyncHistoryList";
import { DataHealthSummary } from "./DataHealthSummary";
import { DataQuality } from "./DataQuality";
import { ImportPanel } from "./ImportPanel";
import { ExportSection } from "./ExportSection";
import { RecomputeStatusCard } from "./RecomputeStatusCard";

export function DataSources() {
  const {
    integrations,
    loading,
    connectIntegration,
    disconnectIntegration,
    syncIntegration,
    updateIntegrationSettings,
  } = useIntegrations();
  const [syncingSource, setSyncingSource] = useState<string | null>(null);

  const handleSyncSource = async (source: "intervals_icu"): Promise<Record<string, unknown>> => {
    setSyncingSource(source);
    try {
      return (await syncIntegration(source)) ?? {};
    } finally {
      setSyncingSource(null);
    }
  };

  if (loading && !integrations.intervals_icu) {
    return (
      <div className="space-y-6">
        <Skeleton variant="rectangular" className="h-[120px] w-full rounded-2xl" />
        <Skeleton variant="rectangular" className="h-[280px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Global Sync & Data Source Overview Metrics */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
            数据源与同步概览
          </h2>
        </div>
        <SyncStatusOverview
          integrations={{ intervals_icu: integrations.intervals_icu }}
          syncingSource={syncingSource}
          onTriggerSync={handleSyncSource}
        />
      </section>

      {/* 2. Structured Tabs for clear hierarchy */}
      <Tabs defaultValue="sources" className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-surface-sunken p-1 rounded-xl">
          <TabsTrigger value="sources" className="text-caption1 font-medium">数据源集成</TabsTrigger>
          <TabsTrigger value="history" className="text-caption1 font-medium">同步历史流水</TabsTrigger>
          <TabsTrigger value="health" className="text-caption1 font-medium">健康度与质量</TabsTrigger>
          <TabsTrigger value="import_export" className="text-caption1 font-medium">文件导入与导出</TabsTrigger>
        </TabsList>

        {/* Tab 1: Data Source Integrations */}
        <TabsContent value="sources" className="pt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Primary Source: Intervals.icu */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-caption1 font-semibold uppercase tracking-wider text-accent-strong">
                  推荐 · 核心数据枢纽
                </span>
              </div>
              <IntervalsSourceCard
                integration={integrations.intervals_icu}
                onConnect={async (athleteId, apiKey) => {
                  await connectIntegration("intervals_icu", {
                    athlete_id: athleteId,
                    api_key: apiKey,
                  });
                }}
                onDisconnect={() => disconnectIntegration("intervals_icu")}
                onSync={() => handleSyncSource("intervals_icu")}
                onSettingsChange={async (freq, autoSync) => {
                  await updateIntegrationSettings("intervals_icu", {
                    sync_frequency: freq,
                    auto_sync: autoSync,
                  });
                }}
              />
            </div>

          </div>
        </TabsContent>

        {/* Tab 2: Sync History & Audit Log */}
        <TabsContent value="history" className="pt-4 space-y-4">
          <div className="rounded-2xl border border-border-default bg-surface-card p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-subheadline font-semibold text-text-primary">
                数据源同步历史与执行审计
              </h3>
              <p className="text-caption1 text-text-muted">
                查看每次同步的数据吞吐量（新增、去重、时序流）、执行耗时以及异常详情诊断。
              </p>
            </div>
            <SyncHistoryList />
          </div>
        </TabsContent>

        {/* Tab 3: Data Health & Quality Diagnostics */}
        <TabsContent value="health" className="pt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-border-default bg-surface-card p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-subheadline font-semibold text-text-primary">
                  数据连续性与健康度
                </h3>
                <p className="text-caption1 text-text-muted">
                  评估训练数据的完整度与最近同步窗口健康状态。
                </p>
              </div>
              <DataHealthSummary />
              <RecomputeStatusCard />
            </div>

            <div className="rounded-2xl border border-border-default bg-surface-card p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-subheadline font-semibold text-text-primary">
                  数据质量与完整度检查
                </h3>
                <p className="text-caption1 text-text-muted">
                  核对心率、配速、功率、高度等关键指标的异常及覆盖率。
                </p>
              </div>
              <DataQuality />
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: File Import & Export */}
        <TabsContent value="import_export" className="pt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ImportPanel />
            <ExportSection />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
