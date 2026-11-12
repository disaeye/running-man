"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw, Link2, FileUp, Plus } from "lucide-react";
import { PageCard } from "@shared/ui/Lovable";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { useIntegrations } from "@features/data/hooks/useIntegrations";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { ImportPanel } from "@features/data/components/ImportPanel";

export function ProfileDataSources() {
  const sync = useSyncDetail("intervals_icu");
  const integrations = useIntegrations();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function startSync() {
    setBusy(true); setError(null);
    try { await integrations.syncIntegration("intervals_icu"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "同步失败"); }
    finally { setBusy(false); }
  }
  return <PageCard title="数据源"><div className="flex items-center gap-3"><Link2 className="h-5 w-5 text-accent-strong" /><div className="flex-1"><div className="text-sm font-medium">Intervals.icu</div><div className="text-xs text-muted-foreground">{sync.data?.status === "connected" ? "已连接" : "尚未连接"} · 最近同步 {sync.data?.last_sync ? new Date(sync.data.last_sync).toLocaleDateString("zh-CN") : "未记录"}</div></div><button type="button" disabled={busy} onClick={() => void startSync()} className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary" aria-label="同步"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /></button></div>{error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}<div className="mt-3 flex gap-2"><button type="button" onClick={() => setOpen(true)} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary px-2 text-xs"><FileUp className="h-3.5 w-3.5" />导入 FIT/GPX/TCX</button><Link href="/settings?section=data" className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary px-2 text-xs"><Plus className="h-3.5 w-3.5" />导出数据</Link></div><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>导入训练文件</DialogTitle></DialogHeader><ImportPanel /></DialogContent></Dialog></PageCard>;
}
