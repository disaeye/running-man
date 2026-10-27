"use client";

import { Badge } from "@shared/ui/Badge";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { useSourceCoverage } from "@features/data/hooks/useSyncJobs";
import { useIntervalsActions } from "@features/data/hooks/useIntervalsActions";
import { IntervalsConnectDialog } from "./IntervalsConnectDialog";
import { BackfillDialog } from "./BackfillDialog";
import { DisconnectConfirmDialog } from "./DisconnectConfirmDialog";
import { formatRelativeTime } from "@shared/lib/format";
import {
  LastSyncDetailBlock,
  SyncProgressBanner,
  SyncErrorLine,
  SyncResultBlock,
} from "./SourceCardShared";
import type { IntegrationStatus, SyncFrequency } from "@features/data/hooks/useIntegrations";

const FREQ_OPTIONS = [
  { value: "hourly", label: "每小时" },
  { value: "daily", label: "每天" },
  { value: "manual", label: "手动" },
];

interface Props {
  integration: IntegrationStatus | null;
  onConnect(id: string, key: string): Promise<void>;
  onDisconnect(clearData: boolean): Promise<void>;
  onSync(): Promise<Record<string, unknown>>;
  onBackfill(fromDate: string): Promise<void>;
  onSettingsChange(freq: SyncFrequency, autoSync: boolean): Promise<void>;
}

const statusVariant: Record<string, "success" | "error"> = { connected: "success", disconnected: "error" };
const statusLabel: Record<string, string> = { connected: "已连接", disconnected: "未连接" };
const stalenessVariant: Record<string, "success" | "warning" | "error" | "neutral"> = {
  fresh: "success", stale: "warning", missing: "error", unknown: "neutral",
};
const stalenessLabel: Record<string, string> = {
  fresh: "数据较新", stale: "数据较旧", missing: "数据缺失", unknown: "未知",
};

function Subtitle({
  connected,
  lastSync,
  syncStatus,
  isSyncing,
}: {
  connected: boolean;
  lastSync: string | null;
  syncStatus?: string | null;
  isSyncing: boolean;
}) {
  if (!connected) return <>尚未连接，连接后可导入活动与健康数据</>;
  if (isSyncing || syncStatus === "running") return <>正在同步…</>;
  return <>{lastSync ? `最后同步 ${formatRelativeTime(lastSync)}` : "已授权"}</>;
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant[status] ?? "error"}>{statusLabel[status] ?? "未连接"}</Badge>;
}

function StalenessBadge({ bucket }: { bucket: string }) {
  return <Badge data-testid="staleness-badge" variant={stalenessVariant[bucket] ?? "neutral"}>{stalenessLabel[bucket] ?? "未知"}</Badge>;
}

function DisconnectedView({ onOpen }: { onOpen: () => void }) {
  return (
    <Button size="sm" onClick={onOpen} className="w-full sm:w-auto font-medium">
      配置 Intervals.icu API 密钥
    </Button>
  );
}

function ConnectedActions({
  onSync,
  onOpenBackfill,
  onOpenDisconnect,
  isBusy,
  integration,
  onSettingsChange,
}: {
  onSync(): void;
  onOpenBackfill(): void;
  onOpenDisconnect(): void;
  isBusy: string | null;
  integration: IntegrationStatus | null;
  onSettingsChange(freq: SyncFrequency, autoSync: boolean): Promise<void>;
}) {
  return (
    <>
      <Button size="sm" onClick={onSync} disabled={isBusy !== null}>
        {isBusy === "sync" ? "同步进行中…" : "增量同步"}
      </Button>
      <Button size="sm" variant="secondary" onClick={onOpenBackfill} disabled={isBusy !== null}>
        导入历史
      </Button>
      <Button size="sm" variant="ghost" onClick={onOpenDisconnect} disabled={isBusy !== null}>
        {isBusy === "disconnect" ? "断开中…" : "断开"}
      </Button>
      <select
        aria-label="Intervals.icu 同步频率"
        className="ml-auto min-h-[44px] rounded-md border border-border-subtle bg-surface-overlay px-3 text-caption1 text-text-secondary focus-ring"
        value={integration?.settings.sync_frequency ?? "daily"}
        onChange={(e) => void onSettingsChange(e.target.value as SyncFrequency, integration?.settings.auto_sync ?? true)}
      >
        {FREQ_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </>
  );
}

export function IntervalsSourceCard({
  integration,
  onConnect,
  onDisconnect,
  onSync,
  onBackfill,
  onSettingsChange,
}: Props) {
  const {
    dialogOpen,
    setDialogOpen,
    backfillOpen,
    setBackfillOpen,
    disconnectOpen,
    setDisconnectOpen,
    athleteId,
    setAthleteId,
    apiKey,
    setApiKey,
    busy,
    syncResult,
    handleConnect,
    handleSync,
    handleStartBackfill,
    handleConfirmDisconnect,
  } = useIntervalsActions({ onConnect, onDisconnect, onSync, onBackfill });

  const connected = integration?.status === "connected";
  const { data: syncDetail } = useSyncDetail("intervals_icu");
  const { coverage } = useSourceCoverage("intervals_icu");
  const lastSync = integration?.last_sync ?? syncDetail?.last_sync ?? null;
  const syncStatus = integration?.last_sync_status ?? syncDetail?.last_sync_status ?? null;
  const isSyncing = busy === "sync" || busy === "backfill" || syncStatus === "running";
  const staleness =
    integration?.staleness_bucket ?? syncDetail?.staleness_bucket ?? "unknown";
  const rawDetail = integration?.last_sync_detail ?? syncDetail?.last_sync_detail ?? null;
  const lastSyncDetail =
    !isSyncing && lastSync && rawDetail && typeof rawDetail === "object"
      ? (rawDetail as Record<string, unknown>)
      : null;

  return (
    <Card padding="md" className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <IcuIcon />
          <div className="min-w-0">
            <span className="text-subheadline font-medium text-text-primary">Intervals.icu</span>
            <p className="text-caption1 text-text-secondary sm:truncate">
              <Subtitle connected={connected} lastSync={lastSync} syncStatus={syncStatus} isSyncing={isSyncing} />
            </p>
          </div>
        </div>
        {/* One status badge. The staleness badge only means something once the
            source is connected; before that both read 未连接 / 数据缺失. */}
        <div className="flex items-center gap-2">
          {connected && <StalenessBadge bucket={staleness} />}
          <StatusBadge status={integration?.status ?? "disconnected"} />
        </div>
      </div>

      <LastSyncDetailBlock detail={lastSyncDetail} connected={connected} />

      {connected && coverage?.firstActivityDate && (
        <p className="text-caption1 text-text-muted">
          数据覆盖：{coverage.firstActivityDate} 至 {coverage.lastActivityDate}（已导入 {coverage.activityCount} 条活动）
        </p>
      )}

      <SyncProgressBanner active={isSyncing} />
      <SyncErrorLine message={syncStatus === "failed" ? integration?.last_sync_error : null} />
      <SyncResultBlock result={syncResult} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!connected ? (
          <DisconnectedView onOpen={() => setDialogOpen(true)} />
        ) : (
          <ConnectedActions
            onSync={handleSync}
            onOpenBackfill={() => setBackfillOpen(true)}
            onOpenDisconnect={() => setDisconnectOpen(true)}
            isBusy={busy}
            integration={integration}
            onSettingsChange={onSettingsChange}
          />
        )}
      </div>

      {integration?.error_count ? (
        <p className="mt-2 text-caption1 text-error">检测到 {integration.error_count} 个同步错误</p>
      ) : null}

      <IntervalsConnectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} athleteId={athleteId} setAthleteId={setAthleteId} apiKey={apiKey} setApiKey={setApiKey} isBusy={busy} onConnect={handleConnect} />
      <BackfillDialog open={backfillOpen} onClose={() => setBackfillOpen(false)} onStartBackfill={handleStartBackfill} isBusy={busy === "backfill"} />
      <DisconnectConfirmDialog open={disconnectOpen} onClose={() => setDisconnectOpen(false)} onConfirm={handleConfirmDisconnect} isBusy={busy === "disconnect"} />
    </Card>
  );
}

function IcuIcon() {
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-info/15 text-info">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M10 2a3 3 0 00-3 3v1H5a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2V8a2 2 0 00-2-2h-2V5a3 3 0 00-3-3zm0 2a1 1 0 011 1v1H9V5a1 1 0 011-1z" />
      </svg>
    </div>
  );
}
