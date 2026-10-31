"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Bell, Link2 } from "lucide-react";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useZoneOverrides } from "@features/settings/hooks/useZoneOverrides";
import { useAbility } from "@features/today/hooks/useAbility";
import { Button } from "@shared/ui/button";
import { Page, PageCard, Tag } from "@shared/ui/Lovable";
import { ProfileDataSources } from "@features/settings/components/ProfileDataSources";
import { DataHealthSummary } from "@features/data/components/DataHealthSummary";
import { ShoeManager } from "@features/settings/components/ShoeManager";
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
  const sport = profile?.preferred_sport ? getSportConfig(profile.preferred_sport).label : "跑步";
  return <Page title="我的" eyebrow={`${profile?.timezone ?? "Asia/Shanghai"} · UTC+8`} right={<Button asChild variant="ghost" size="icon"><Link href="/settings" aria-label="设置"><Link2 /></Link></Button>}><div data-testid="athlete-profile-page" className="space-y-4">
    <PageCard><div className="flex items-center gap-3"><div className="num grid h-12 w-12 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">{profile?.name?.trim().slice(0, 1) || "跑"}</div><div className="flex-1"><h2 className="font-semibold">{profile?.name?.trim() || "未设置姓名"}</h2><div className="mt-1 text-xs text-muted-foreground">{sport} · 每周训练 {profile?.weekly_training_days ?? NO_VALUE} 天</div></div><Link href="/settings?section=notifications" className="rounded-full bg-secondary p-2" aria-label="通知"><Bell className="h-4 w-4" /></Link></div></PageCard>
    <p className="-mt-2 text-caption1 text-muted-foreground">时区用于判定跨午夜活动的日期归属</p>
    <PageCard title="生理参数"><div className="divide-y divide-border"><Parameter label="最大摄氧量" value={ability.data?.vdot?.toFixed(1) ?? null} source="估算" /><Parameter label="乳酸阈心率 LTHR" value={zones?.lthr != null ? `${Math.round(zones.lthr)} bpm` : null} source="估算" /><Parameter label="阈值配速" value={zones?.threshold_pace != null ? `${formatPaceFromSeconds(Math.round(zones.threshold_pace))}/km` : null} source="估算" /><Parameter label="最大心率 HRmax" value={zones?.hr_max != null ? `${Math.round(zones.hr_max)} bpm` : null} source="设置" /><Parameter label="静息心率" value={zones?.resting_hr != null ? `${Math.round(zones.resting_hr)} bpm` : null} source="设备" /></div></PageCard>
    <PageCard title="心率区间"><div className="space-y-2">{(zones?.hr_zones ?? []).map((zone) => <div key={zone.zone} className="flex items-center gap-3 text-xs"><span className="w-20 text-muted-foreground">Z{zone.zone} {zone.name}</span><span className="num flex-1">{zone.min_value}–{zone.max_value ?? "∞"} bpm</span></div>)}</div><Button asChild variant="link" className="mt-3 px-0"><Link href="/settings?section=zones">调整训练区间</Link></Button></PageCard>
    <section aria-label="跑鞋与装备" className="space-y-3"><h2 className="eyebrow">跑鞋与装备</h2><ShoeManager /></section>

    <ProfileDataSources />
    <PageCard title="数据质量"><DataHealthSummary /></PageCard>
  </div></Page>;
}

function Parameter({ label, value, source }: { label: string; value: string | null; source: string }) {
  return <div className="flex items-center justify-between gap-3 py-2.5"><span className="text-xs text-muted-foreground">{label}</span><span className="flex items-center gap-2"><span className="num text-sm">{value ?? NO_VALUE}</span><Tag>{source}</Tag></span></div>;
}
