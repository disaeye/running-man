"use client";

import { useState, useCallback } from "react";
import { useToast } from "@shared/ui/Toast";
import type { SyncResult } from "@features/data/components/SourceCardShared";

interface UseIntervalsActionsOptions {
  onConnect(id: string, key: string): Promise<void>;
  onDisconnect(clearData: boolean): Promise<void>;
  onSync(): Promise<Record<string, unknown>>;
  onBackfill(fromDate: string): Promise<void>;
}

export function useIntervalsActions({
  onConnect,
  onDisconnect,
  onSync,
  onBackfill,
}: UseIntervalsActionsOptions) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [athleteId, setAthleteId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | "backfill" | null>(null);
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
    toast("增量同步已排队，完成后自动更新", "info");
    try {
      const result = await onSync();
      const upserted = (result.upserted as number) ?? 0;
      const deduplicated = (result.deduplicated as number) ?? 0;
      const total = (result.total_processed as number) ?? 0;
      setSyncResult({ upserted, deduplicated, total_processed: total });
      toast(`同步完成：新增 ${upserted} 条，去重 ${deduplicated} 条`, "success");
    } catch (error) {
      setSyncResult(null);
      const msg = error instanceof Error && error.message ? error.message : "同步失败";
      toast(msg, "error");
    } finally {
      setBusy(null);
    }
  }, [onSync, toast]);

  const handleStartBackfill = useCallback(
    async (fromDate: string) => {
      setBusy("backfill");
      toast(`已发起从 ${fromDate} 至今的历史导入`, "info");
      try {
        await onBackfill(fromDate);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "历史导入排队失败";
        toast(msg, "error");
      } finally {
        setBusy(null);
      }
    },
    [onBackfill, toast],
  );

  const handleConfirmDisconnect = useCallback(
    async (clearData: boolean) => {
      setBusy("disconnect");
      try {
        await onDisconnect(clearData);
        toast(clearData ? "已断开连接并清空同步数据" : "已断开 Intervals.icu 连接", "info");
      } catch {
        toast("断开操作失败", "error");
      } finally {
        setBusy(null);
      }
    },
    [onDisconnect, toast],
  );

  return {
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
  };
}
