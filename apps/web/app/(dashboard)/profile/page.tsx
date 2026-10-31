"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useZoneOverrides } from "@features/settings/hooks/useZoneOverrides";
import { useAbility } from "@features/today/hooks/useAbility";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { Button } from "@shared/ui/button";
import { Page, PageCard, Tag } from "@shared/ui/Lovable";
import { DataHealthSummary } from "@features/data/components/DataHealthSummary";
import { ShoeManager } from "@features/settings/components/ShoeManager";
import { ThresholdHistoryChart } from "@features/settings/components/ThresholdHistoryChart";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { getSportConfig } from "@shared/config/sport-config";

export default function ProfilePage() {
  return <Suspense fallback={null}><ProfileContent /></Suspense>;
}

function ProfileContent() {
  const { profile } = useProfile();
  const { zones } = useZoneOverrides();
  const ability = useAbility();
  const sync = useSyncDetail("intervals_icu");
  const sport = profile?.preferred_sport ? getSportConfig(profile.preferred_sport).label : "跑步";
  return <Page title="我的" right={<Button asChild variant="ghost" size="icon"><Link href="/settings" aria-label="设置"><Settings2 /></Link></Button>}><div data-testid="athlete-profile-page" className="space-y-4">
    <PageCard><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{profile?.name?.trim() || "未设置姓名"}</h2><Tag tone="primary">{sport}</Tag></div><div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground"><span>每周训练 {profile?.weekly_training_days ?? NO_VALUE} 天</span><span>时区 {profile?.timezone ?? NO_VALUE}</span><span>VDOT {ability.data?.vdot?.toFixed(1) ?? NO_VALUE}</span></div></PageCard>
    <PageCard title="生理参数"><div className="divide-y divide-border"><Parameter label="最大摄氧量" value={ability.data?.vdot?.toFixed(1) ?? null} source="估算" /><Parameter label="乳酸阈心率 LTHR" value={zones?.lthr != null ? `${Math.round(zones.lthr)} bpm` : null} source="估算" /><Parameter label="阈值配速" value={zones?.threshold_pace != null ? `${formatPaceFromSeconds(Math.round(zones.threshold_pace))}/km` : null} source="估算" /><Parameter label="最大心率 HRmax" value={zones?.hr_max != null ? `${Math.round(zones.hr_max)} bpm` : null} source="设置" /><Parameter label="静息心率" value={zones?.resting_hr != null ? `${Math.round(zones.resting_hr)} bpm` : null} source="设备" /></div></PageCard>
    <PageCard title="心率区间"><div className="space-y-2">{(zones?.hr_zones ?? []).map((zone) => <div key={zone.zone} className="flex items-center gap-3 text-xs"><span className="w-20 text-muted-foreground">Z{zone.zone} {zone.name}</span><span className="num flex-1">{zone.min_value}–{zone.max_value ?? "∞"} bpm</span></div>)}</div><Button asChild variant="link" className="mt-3 px-0"><Link href="/settings?section=zones">调整训练区间</Link></Button></PageCard>
    <section aria-label="跑鞋与装备" className="space-y-3"><h2 className="eyebrow">跑鞋与装备</h2><ShoeManager /></section>
    <PageCard title="阈值变化"><ThresholdHistoryChart /></PageCard>
    <PageCard title="数据来源"><p className="text-sm font-medium">Intervals.icu</p><p className="mt-1 text-xs text-muted-foreground">{sync.data?.status === "connected" ? "已连接" : "尚未连接"}{sync.data?.last_sync ? ` · 最近同步 ${new Date(sync.data.last_sync).toLocaleDateString("zh-CN")}` : ""}</p>{sync.data?.last_sync_error ? <p role="alert" className="mt-2 text-xs text-destructive">{sync.data.last_sync_error}</p> : null}<Button asChild variant="outline" className="mt-4"><Link href="/settings?section=data">管理数据源</Link></Button></PageCard>
    <PageCard title="数据质量"><DataHealthSummary /></PageCard>
  </div></Page>;
}

function Parameter({ label, value, source }: { label: string; value: string | null; source: string }) {
  return <div className="flex items-center justify-between gap-3 py-2.5"><span className="text-xs text-muted-foreground">{label}</span><span className="flex items-center gap-2"><span className="num text-sm">{value ?? NO_VALUE}</span><Tag>{source}</Tag></span></div>;
}
