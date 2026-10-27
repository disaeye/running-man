"use client";

import { useState } from "react";
import { Skeleton } from "@shared/ui/Skeleton";
import { Card } from "@shared/ui/Card";
import { useIntegrations } from "@features/data/hooks/useIntegrations";
import { startBackfill } from "@features/data/hooks/useSyncJobs";
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
      const summary = await syncIntegration(source);
      return { ...summary };
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
    <div className="space-y-6">
      <SyncStatusOverview
        integrations={{ intervals_icu: integrations.intervals_icu }}
        syncingSource={syncingSource}
        onTriggerSync={handleSyncSource}
      />

      <Tabs defaultValue="sources" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4 rounded-xl bg-surface-sunken p-1">
          <TabsTrigger value="sources" className="whitespace-normal px-1 text-caption1 font-medium leading-tight">数据源集成</TabsTrigger>
          <TabsTrigger value="history" className="whitespace-normal px-1 text-caption1 font-medium leading-tight">同步历史流水</TabsTrigger>
          <TabsTrigger value="health" className="whitespace-normal px-1 text-caption1 font-medium leading-tight">健康度与质量</TabsTrigger>
          <TabsTrigger value="import_export" className="whitespace-normal px-1 text-caption1 font-medium leading-tight">文件导入与导出</TabsTrigger>
        </TabsList>

        {/* Tab 1: Data Source Integrations */}
        <TabsContent value="sources" className="pt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <IntervalsSourceCard
              integration={integrations.intervals_icu}
              onConnect={async (athleteId, apiKey) => {
                await connectIntegration("intervals_icu", {
                  athlete_id: athleteId,
                  api_key: apiKey,
                });
              }}
              onDisconnect={(clearData) => disconnectIntegration("intervals_icu", clearData)}
              onSync={() => handleSyncSource("intervals_icu")}
              onBackfill={async (fromDate) => {
                await startBackfill("intervals_icu", fromDate);
              }}
              onSettingsChange={async (freq, autoSync) => {
                await updateIntegrationSettings("intervals_icu", {
                  sync_frequency: freq,
                  auto_sync: autoSync,
                });
              }}
            />
          </div>
        </TabsContent>

        {/* Tab 2: Sync History & Audit Log */}
        <TabsContent value="history" className="pt-4 space-y-4">
          <Card padding="md">
            <SyncHistoryList />
          </Card>
        </TabsContent>

        {/* Tab 3: Data Health & Quality Diagnostics */}
        <TabsContent value="health" className="pt-4 space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card padding="md" className="space-y-4">
              <div>
                <h3 className="text-caption1 font-semibold text-text-secondary">
                  数据连续性与健康度
                </h3>
                <p className="text-caption1 text-text-muted">
                  评估训练数据的完整度与最近同步窗口健康状态。
                </p>
              </div>
              <DataHealthSummary />
              <RecomputeStatusCard />
            </Card>

            <Card padding="md" className="space-y-4">
              <div>
                <h3 className="text-caption1 font-semibold text-text-secondary">
                  数据质量与完整度检查
                </h3>
                <p className="text-caption1 text-text-muted">
                  核对心率、配速、功率、高度等关键指标的异常及覆盖率。
                </p>
              </div>
              <DataQuality />
            </Card>
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
