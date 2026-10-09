"use client";

import { useState, useCallback } from "react";
import { Badge } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import { useToast } from "@shared/ui/Toast";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { IntervalsConnectDialog } from "./IntervalsConnectDialog";
import { formatRelativeTime } from "@shared/lib/format";
import {
  LastSyncDetailBlock,
  SyncProgressBanner,
  SyncErrorLine,
  SyncResultBlock,
  type SyncResult,
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
  onDisconnect(): Promise<void>;
  onSync(): Promise<Record<string, unknown>>;
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
  if (!connected) return <>未连接</>;
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

function ConnectedActions({ onSync, onDisconnect, isBusy, integration, onSettingsChange }: {
  onSync(): void;
  onDisconnect(): void;
  isBusy: string | null;
  integration: IntegrationStatus | null;
  onSettingsChange(freq: SyncFrequency, autoSync: boolean): Promise<void>;
}) {
  return (
    <>
      <Button size="sm" onClick={onSync} disabled={isBusy !== null}>
        {isBusy === "sync" ? "同步进行中…" : "同步"}
      </Button>
      <Button size="sm" variant="secondary" onClick={onDisconnect} disabled={isBusy !== null}>
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

function useIntervalsActions({ onConnect, onDisconnect, onSync }: {
  onConnect(id: string, key: string): Promise<void>;
  onDisconnect(): Promise<void>;
  onSync(): Promise<Record<string, unknown>>;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [athleteId, setAthleteId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const handleConnect = useCallback(async () => {
    if (!athleteId.trim() || !apiKey.trim()) {
      toast("请填写 Athlete ID 和 API Key", "warning");
      return;
    }
    setBusy("connect");
    try {
      await onConnect(athleteId.trim(), apiKey.trim());
      toast("Intervals.icu 已连接", "success");
      setDialogOpen(false);
      setAthleteId("");
      setApiKey("");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "请检查 Athlete ID 与 API Key 是否正确";
      toast(`连接失败: ${detail}`, "error");
    } finally {
      setBusy(null);
    }
  }, [athleteId, apiKey, onConnect, toast]);

  const handleSync = useCallback(async () => {
    setBusy("sync");
    setSyncResult(null);
    toast("同步已开始，完成后会自动更新", "info");
    try {
      const result = await onSync();
      const upserted = (result.upserted as number) ?? 0;
      const deduplicated = (result.deduplicated as number) ?? 0;
      const total = (result.total_processed as number) ?? 0;
      setSyncResult({ upserted, deduplicated, total_processed: total });
      toast(`同步完成：新增/更新 ${upserted} 条，去重 ${deduplicated} 条，共处理 ${total} 条`, "success");
    } catch (error) {
      setSyncResult(null);
      const msg = error instanceof Error && error.message ? error.message : "同步失败";
      toast(msg.includes("版本") ? "同步超时或连接中断，请刷新查看是否已完成" : msg, "error");
    } finally {
      setBusy(null);
    }
  }, [onSync, toast]);

  const handleDisconnect = useCallback(async () => {
    setBusy("disconnect");
    try {
      await onDisconnect();
      toast("已断开 Intervals.icu", "info");
    } catch {
      toast("断开失败", "error");
    } finally {
      setBusy(null);
    }
  }, [onDisconnect, toast]);

  return { dialogOpen, setDialogOpen, athleteId, setAthleteId, apiKey, setApiKey, busy, syncResult, handleConnect, handleSync, handleDisconnect };
}

export function IntervalsSourceCard({
  integration,
  onConnect,
  onDisconnect,
  onSync,
  onSettingsChange,
}: Props) {
  const { dialogOpen, setDialogOpen, athleteId, setAthleteId, apiKey, setApiKey, busy, syncResult, handleConnect, handleSync, handleDisconnect } = useIntervalsActions({ onConnect, onDisconnect, onSync });

  const connected = integration?.status === "connected";
  const { data: syncDetail } = useSyncDetail("intervals_icu");
  const lastSync = integration?.last_sync ?? syncDetail?.last_sync ?? null;
  const syncStatus = integration?.last_sync_status ?? syncDetail?.last_sync_status ?? null;
  const isSyncing = busy === "sync" || syncStatus === "running";
  const staleness =
    integration?.staleness_bucket ?? syncDetail?.staleness_bucket ?? "unknown";
  const rawDetail = integration?.last_sync_detail ?? syncDetail?.last_sync_detail ?? null;
  const lastSyncDetail =
    !isSyncing && lastSync && rawDetail && typeof rawDetail === "object"
      ? (rawDetail as Record<string, unknown>)
      : null;

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <IcuIcon />
          <div className="min-w-0">
            <span className="text-subheadline font-medium text-text-primary">Intervals.icu</span>
            <p className="truncate text-caption1 text-text-secondary">
              <Subtitle connected={connected} lastSync={lastSync} syncStatus={syncStatus} isSyncing={isSyncing} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StalenessBadge bucket={staleness} />
          <StatusBadge status={integration?.status ?? "disconnected"} />
        </div>
      </div>

      <LastSyncDetailBlock detail={lastSyncDetail} connected={connected} />
      <SyncProgressBanner active={isSyncing} />
      <SyncErrorLine message={syncStatus === "failed" ? integration?.last_sync_error : null} />
      <SyncResultBlock result={syncResult} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!connected
          ? <DisconnectedView onOpen={() => setDialogOpen(true)} />
          : <ConnectedActions onSync={handleSync} onDisconnect={handleDisconnect} isBusy={busy} integration={integration} onSettingsChange={onSettingsChange} />}
      </div>

      {integration?.error_count ? (
        <p className="mt-2 text-caption1 text-error">检测到 {integration.error_count} 个同步错误</p>
      ) : null}

      <IntervalsConnectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} athleteId={athleteId} setAthleteId={setAthleteId} apiKey={apiKey} setApiKey={setApiKey} isBusy={busy} onConnect={handleConnect} />
    </div>
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
