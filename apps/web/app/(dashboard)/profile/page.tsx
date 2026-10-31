"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useZoneOverrides } from "@features/settings/hooks/useZoneOverrides";
import { useAbility } from "@features/today/hooks/useAbility";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { PageHeader } from "@shared/ui/PageHeader";
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

  return (
    <div className="page-stack" data-testid="athlete-profile-page">
      <PageHeader
        title="我的"
        action={<Button asChild variant="ghost" size="icon"><Link href="/settings" aria-label="设置"><Settings2 /></Link></Button>}
      />

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold">{profile?.name?.trim() || "未设置姓名"}</h2>
          <span className="rounded-full bg-surface-overlay px-2 py-1 text-caption1 text-text-secondary">{sport}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption1 text-text-muted">
          <span>每周训练 {profile?.weekly_training_days ?? NO_VALUE} 天</span>
          <span>时区 {profile?.timezone ?? NO_VALUE}</span>
          <span>VDOT {ability.data?.vdot?.toFixed(1) ?? NO_VALUE}</span>
        </div>
      </Card>

      <Card>
        <CardTitle title="生理参数" />
        <div className="mt-3 divide-y divide-border-subtle">
          <Parameter label="最大摄氧量" value={ability.data?.vdot?.toFixed(1) ?? null} source="估算" />
          <Parameter label="乳酸阈心率 LTHR" value={zones?.lthr != null ? `${Math.round(zones.lthr)} bpm` : null} source="估算" />
          <Parameter label="阈值配速" value={zones?.threshold_pace != null ? `${formatPaceFromSeconds(Math.round(zones.threshold_pace))}/km` : null} source="估算" />
          <Parameter label="最大心率 HRmax" value={zones?.hr_max != null ? `${Math.round(zones.hr_max)} bpm` : null} source="设置" />
          <Parameter label="静息心率" value={zones?.resting_hr != null ? `${Math.round(zones.resting_hr)} bpm` : null} source="设备" />
        </div>
      </Card>

      <Card>
        <CardTitle title="心率区间" />
        <div className="mt-3 space-y-2">
          {(zones?.hr_zones ?? []).map((zone) => (
            <div key={zone.zone} className="flex items-center gap-3 text-caption1">
              <span className="w-14 text-text-secondary">Z{zone.zone} {zone.name}</span>
              <span className="flex-1 font-mono text-text-primary">{zone.min_value}–{zone.max_value ?? "∞"} bpm</span>
            </div>
          ))}
          {!zones ? <p className="text-caption1 text-text-muted">正在读取训练区间…</p> : null}
        </div>
        <Button asChild variant="link" className="mt-3 px-0"><Link href="/settings?section=zones">调整训练区间</Link></Button>
      </Card>

      <section aria-label="跑鞋与装备" className="space-y-3">
        <h2 className="text-caption1 text-text-muted">跑鞋与装备</h2>
        <ShoeManager />
      </section>

      <Card>
        <CardTitle title="阈值变化" />
        <div className="mt-3"><ThresholdHistoryChart /></div>
      </Card>

      <Card>
        <CardTitle title="数据来源" />
        <p className="mt-3 text-subheadline text-text-primary">Intervals.icu</p>
        <p className="mt-1 text-caption1 text-text-muted">
          {sync.data?.status === "connected" ? "已连接" : "尚未连接"}
          {sync.data?.last_sync ? ` · 最近同步 ${new Date(sync.data.last_sync).toLocaleDateString("zh-CN")}` : ""}
        </p>
        {sync.data?.last_sync_error ? <p role="alert" className="mt-2 text-caption1 text-error">{sync.data.last_sync_error}</p> : null}
        <Button asChild variant="outline" className="mt-4"><Link href="/settings?section=data">管理数据源</Link></Button>
      </Card>

      <Card>
        <CardTitle title="数据质量" />
        <div className="mt-3"><DataHealthSummary /></div>
      </Card>
    </div>
  );
}

function CardTitle({ title }: { readonly title: string }) {
  return <h2 className="text-caption1 text-text-muted">{title}</h2>;
}

function Parameter({ label, value, source }: { readonly label: string; readonly value: string | null; readonly source: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-caption1 text-text-secondary">{label}</span>
      <span className="flex items-center gap-2 text-right">
        <span className="font-mono text-caption1 text-text-primary">{value ?? NO_VALUE}</span>
        <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-caption2 text-text-muted">{source}</span>
      </span>
    </div>
  );
}
