"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, RefreshCw } from "lucide-react";
import { useSWRConfig } from "swr";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useZoneOverrides } from "@features/settings/hooks/useZoneOverrides";
import { useThresholdHistory } from "@features/settings/hooks/useThresholdHistory";
import { useCurrentReadings } from "@features/health/lib/physiology-display";
import { ProfileDataQuality } from "@features/profile/components/ProfileDataQuality";
import { buildHeartRateZones } from "@features/profile/lib/heart-rate-zones";
import {
  buildPhysiologyParameters,
  type PhysiologyParameter,
} from "@features/profile/lib/physiology-parameters";
import { timezoneOffsetLabel } from "@features/profile/lib/timezone-label";
import { ProfileDataSources } from "@features/settings/components/ProfileDataSources";
import { ShoeManager } from "@features/settings/components/ShoeManager";
import { Button } from "@shared/ui/button";
import { Page, PageCard, SourceTag } from "@shared/ui/Lovable";
import { getSportConfig } from "@shared/config/sport-config";
import { apiFetch } from "@shared/lib/api";
import { NO_VALUE } from "@shared/lib/use-data-state";

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent() {
  const { profile } = useProfile();
  const { zones } = useZoneOverrides();
  const thresholds = useThresholdHistory();
  const { mutate } = useSWRConfig();
  const [calculating, setCalculating] = useState(false);
  const [calculationMessage, setCalculationMessage] = useState<string | null>(null);

  const timezone = profile?.timezone ?? "UTC";
  const readings = useCurrentReadings();

  const parameters = useMemo(
    () =>
      buildPhysiologyParameters({
        entries: thresholds.entries,
        readings,
        lthrFallback: zones?.lthr ?? null,
        hrMaxFallback: zones?.hr_max ?? null,
        thresholdPaceFallback: zones?.threshold_pace ?? null,
        restingHrFallback: profile?.resting_hr ?? zones?.resting_hr ?? null,
      }),
    [
      thresholds.entries,
      readings,
      zones?.lthr,
      zones?.hr_max,
      zones?.threshold_pace,
      zones?.resting_hr,
      profile?.resting_hr,
    ],
  );
  const heartRateZones = useMemo(
    () => buildHeartRateZones(zones?.hr_zones ?? null),
    [zones?.hr_zones],
  );

  const sport = profile?.preferred_sport ? getSportConfig(profile.preferred_sport).label : "跑步";

  async function autoCalculate() {
    setCalculating(true);
    setCalculationMessage(null);
    try {
      await apiFetch("/athletes/me/auto-calculate", { method: "POST" });
      await Promise.all([
        mutate(["/insights/zones", {}]),
        mutate(["/athletes/me/thresholds", {}]),
      ]);
      setCalculationMessage("已根据最近活动更新生理参数");
    } catch {
      setCalculationMessage("自动测算失败，请稍后重试");
    } finally {
      setCalculating(false);
    }
  }

  return (
    <Page
      title="我的"
      eyebrow={`${timezone} · ${timezoneOffsetLabel(timezone)}`}
    >
      <div data-testid="athlete-profile-page" className="space-y-4">
        <PageCard>
          <div className="flex items-center gap-3">
            <div className="num grid h-12 w-12 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
              {profile?.name?.trim().slice(0, 1) || "跑"}
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">{profile?.name?.trim() || "未设置姓名"}</h2>
              <div className="mt-1 text-subheadline text-muted-foreground">
                {sport} · 每周训练 {profile?.weekly_training_days ?? NO_VALUE} 天
              </div>
            </div>
            <Link
              href="/settings?section=account"
              className="rounded-full bg-secondary p-2"
              aria-label="通知与偏好"
            >
              <Bell className="h-4 w-4" />
            </Link>
          </div>
        </PageCard>
        <p className="-mt-2 text-caption1 text-muted-foreground">
          时区用于判定跨午夜活动的日期归属
        </p>

        <PageCard
          title="生理参数"
          action={
            <button
              type="button"
              onClick={() => void autoCalculate()}
              disabled={calculating}
              className="flex min-h-11 items-center gap-1 px-1 text-caption1 text-accent-strong"
            >
              <RefreshCw size={12} />
              {calculating ? "测算中…" : "自动测算"}
            </button>
          }
        >
          <div className="divide-y divide-border">
            {parameters.map((parameter) => (
              <ParameterRow key={parameter.key} parameter={parameter} />
            ))}
          </div>
          {calculationMessage ? (
            <p className="mt-2 text-caption1 text-muted-foreground">{calculationMessage}</p>
          ) : null}
        </PageCard>

        <PageCard title="心率区间" action={<span className="text-caption1 text-muted-foreground">按阈值划分</span>}>
          <div className="space-y-2">
            {heartRateZones.map((zone) => (
              <div key={zone.zone} className="flex items-center gap-3 text-subheadline">
                <span className={`h-3 w-3 shrink-0 rounded-sm ${zone.color}`} aria-hidden />
                <span className="flex-1">{zone.name}</span>
                <span className="num text-base">{zone.range}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-caption1 text-muted-foreground">
            配速区间、功率区间同理按阈值配速与 FTP 计算
          </p>
          <Button asChild variant="link" className="mt-2 px-0">
            <Link href="/settings?section=training">调整训练区间</Link>
          </Button>
        </PageCard>

        <section aria-label="跑鞋与装备" className="space-y-3">
          <h2 className="eyebrow">跑鞋与装备</h2>
          <ShoeManager />
        </section>

        <ProfileDataSources />

        <PageCard title="数据质量">
          <ProfileDataQuality />
        </PageCard>
      </div>
    </Page>
  );
}

function ParameterRow({ parameter }: { parameter: PhysiologyParameter }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5"
      data-testid={`physiology-${parameter.key}`}
    >
      <div>
        <div className="text-subheadline">{parameter.label}</div>
        <div className="text-caption1 text-muted-foreground">
          {parameter.dateLabel ?? "尚未记录"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="num text-title3 font-semibold">{parameter.value ?? NO_VALUE}</span>
        {parameter.source ? <SourceTag source={parameter.source} /> : null}
      </div>
    </div>
  );
}
