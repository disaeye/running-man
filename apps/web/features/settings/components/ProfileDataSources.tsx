"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw, Link2, FileUp, Plus } from "lucide-react";
import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { ProfileDataQuality } from "@features/profile/components/ProfileDataQuality";
import { useToast } from "@shared/ui/Toast";
import { apiErrorMessage } from "@shared/lib/api";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { useIntegrations } from "@features/data/hooks/useIntegrations";
import { isJobActive, useSyncJob } from "@features/data/hooks/useSyncJobs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { ImportPanel } from "@features/data/components/ImportPanel";

export function ProfileDataSources() {
  const { toast } = useToast();
  const sync = useSyncDetail("intervals_icu");
  const integrations = useIntegrations();
  const syncJob = useSyncJob("intervals_icu");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncing = busy || isJobActive(syncJob.job);

  async function startSync() {
    setBusy(true);
    setError(null);
    toast("增量同步已排队，完成后自动更新", "info");
    try {
      const summary = await integrations.syncIntegration("intervals_icu");
      await syncJob.reload();
      toast(`同步完成：新增 ${summary.upserted} 条，去重 ${summary.deduplicated} 条`, "success");
    } catch (caught) {
      const msg = apiErrorMessage(caught, "同步失败");
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }
  const connected = sync.data?.status === "connected";
  const lastSyncText = sync.data?.last_sync
    ? new Date(sync.data.last_sync).toLocaleDateString("zh-CN")
    : "未记录";
  const summaryText = `Intervals.icu ${connected ? "已连接" : "尚未连接"} · 最近同步 ${lastSyncText} · 点击展开导入与数据质量`;

  return (
    <DisclosureCard
      title="数据同步与质量"
      summary={summaryText}
      action={
        connected ? (
          <button
            type="button"
            disabled={syncing}
            onClick={() => void startSync()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary disabled:opacity-50"
            aria-label="立即同步"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
          </button>
        ) : (
          <Link
            href="/settings?section=data"
            className="inline-flex min-h-10 items-center rounded-full bg-secondary px-3 text-xs font-medium text-accent-strong hover:bg-secondary/80"
          >
            去连接
          </Link>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link2 className="h-5 w-5 text-accent-strong" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Intervals.icu</div>
            <div className="text-xs text-muted-foreground">
              {connected ? "已连接" : "尚未连接"} · 最近同步 {lastSyncText}
            </div>
          </div>
        </div>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary px-2 text-xs"
          >
            <FileUp className="h-3.5 w-3.5" aria-hidden />
            导入 FIT/GPX/TCX
          </button>
          <Link
            href="/settings?section=data"
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary px-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            同步与导出设置
          </Link>
        </div>
        <div className="border-t border-border-subtle pt-4">
          <h3 className="mb-2 text-caption1 font-semibold text-text-secondary">数据质量</h3>
          <ProfileDataQuality />
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent mobileSheet>
          <DialogHeader>
            <DialogTitle>导入训练文件</DialogTitle>
          </DialogHeader>
          <ImportPanel
            onUploaded={({ succeeded, failed }) => {
              if (failed === 0) {
                toast(`已成功导入 ${succeeded} 个训练文件`, "success");
                setOpen(false);
              } else {
                toast(`成功 ${succeeded} 个，另有 ${failed} 个文件未导入成功`, "warning");
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </DisclosureCard>
  );
}
