"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useZoneOverrides } from "@features/settings/hooks/useZoneOverrides";
import { useRaceResults } from "@features/settings/hooks/useRaceResults";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";
import { useAbility } from "@features/today/hooks/useAbility";
import { useLifetimeTotals } from "@features/today/hooks/useLifetimeTotals";
import { useAthleteGrade } from "@features/today/hooks/useAthleteGrade";
import { usePersonalRange } from "@features/today/hooks/usePersonalRange";
import { useWellness } from "@features/health/hooks/useWellness";
import { useReadiness } from "@features/today/hooks/useReadiness";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { Card } from "@shared/ui/Card";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { Button } from "@shared/ui/button";
import { PageHeader } from "@shared/ui/PageHeader";
import { DemoIdentityCard } from "@features/settings/components/DemoIdentityCard";
import { DemoPhysiologyCard } from "@features/settings/components/DemoPhysiologyCard";
import { DemoRecordsWall } from "@features/settings/components/DemoRecordsWall";
import { DemoLoadRiskCard } from "@features/settings/components/DemoLoadRiskCard";
import { DemoDevicesCard } from "@features/settings/components/DemoDevicesCard";
import { DataHealthSummary } from "@features/data/components/DataHealthSummary";
import { SettingsZones } from "@features/settings/components/SettingsZones";
import { ShoeManager } from "@features/settings/components/ShoeManager";
import { ThresholdHistoryChart } from "@features/settings/components/ThresholdHistoryChart";
import { bestSummary } from "@features/settings/lib/profile-summary";

const WINDOW_DAYS = 42;

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageContent />
    </Suspense>
  );
}

function ProfilePageContent() {
  const { profile } = useProfile();
  const {
    zones,
    loading: zonesLoading,
    saving: zonesSaving,
    error: zonesError,
    saveOverrides,
    resetZones,
    selectScheme,
  } = useZoneOverrides();
  const raceResults = useRaceResults();
  const personalRecords = usePersonalRecords();
  const ability = useAbility();
  const lifetime = useLifetimeTotals();
  const grade = useAthleteGrade();
  const personalRange = usePersonalRange();
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(WINDOW_DAYS, timezone), [timezone]);
  const wellness = useWellness(range.from, range.to);

  const readiness = useReadiness();
  const intervalSync = useSyncDetail("intervals_icu");

  const latestWellness = wellness.data.at(-1) ?? null;
  const figures = personalRange.data?.figures ?? [];
  const local = readiness.data?.local_readiness ?? null;
  const recoveryIndex =
    local !== null && local.data_sufficient ? Math.round(local.score) : null;

  return (
    <div className="page-stack" data-testid="athlete-profile-page">
      <PageHeader
        title="我的"
        description="个人资料、跑步生理指标、训练区间与跑鞋记录。"
        action={
          <Button asChild variant="outline">
            <Link href="/settings">
              <Settings2 aria-hidden="true" />
              设置
            </Link>
          </Button>
        }
      />

      <section aria-label="跑者资料" className="space-y-4">
        <DemoIdentityCard
          profile={profile}
          lifetimeDistanceM={lifetime.distance_m}
          raceCount={raceResults.data.length > 0 ? raceResults.data.length : null}
          vdot={ability.data?.vdot ?? null}
          tierLabel={grade.data?.grade?.tier ?? null}
          bestSummary={bestSummary(raceResults.data)}
        />
      </section>

      <DemoPhysiologyCard
        vo2max={latestWellness?.vo2max ?? null}
        vo2maxSource={latestWellness?.vo2max != null ? "Intervals.icu 同步" : null}
        restingHr={zones?.resting_hr ?? profile?.resting_hr ?? null}
        lthr={zones?.lthr ?? profile?.lthr ?? null}
        thresholdPaceSPerKm={zones?.threshold_pace ?? profile?.threshold_pace ?? null}
        weightKg={latestWellness?.weight ?? null}
        heightCm={profile?.height_cm ?? null}
        bodyFatPct={latestWellness?.body_fat_pct ?? null}
        windowDays={personalRange.data?.window_days ?? 90}
      />

      <ThresholdHistoryChart />

      <section aria-labelledby="profile-records-title" className="space-y-3">
        <div className="space-y-1">
          <h2 id="profile-records-title" className="font-display text-display-sm font-semibold text-text-primary">个人最好成绩</h2>
          <p className="text-caption1 text-text-muted">实际比赛成绩与训练中记录的最佳表现分别展示。</p>
        </div>
        <DemoRecordsWall
          raceResults={raceResults.data.map((row) => ({
            event_name: row.event_name,
            distance_category: row.distance_category,
            time_s: row.time_s,
            race_date: row.race_date,
          }))}
          personalRecords={personalRecords.data.map((row) => ({
            type: row.type,
            value_formatted: row.value_formatted,
            date: row.date,
          }))}
        />
      </section>

      <section aria-labelledby="profile-zones-title" className="space-y-3">
        <div>
          <h2 id="profile-zones-title" className="text-title3 font-semibold text-text-primary">训练区间</h2>
          <p className="mt-1 text-caption1 text-text-muted">心率区间与阈值配速由当前个人阈值计算。</p>
        </div>
        {zones ? (
          <SettingsZones
            hrZones={zones.hr_zones}
            paceZones={zones.pace_zones}
            thresholdPace={zones.threshold_pace}
            hrScheme={zones.hr_scheme}
            hrSchemeOptions={zones.hr_scheme_options}
            hrSchemeCitation={zones.hr_scheme_citation}
            unavailableRequirements={zones.unavailable_requirements}
            hrMax={zones.hr_max}
            hrMaxEstimated={zones.hr_max_estimated}
            lthr={zones.lthr}
            restingHr={zones.resting_hr}
            hasOverrides={zones.has_overrides}
            loading={zonesLoading}
            saving={zonesSaving}
            onSave={saveOverrides}
            onReset={resetZones}
            onSelectScheme={selectScheme}
          />
        ) : zonesLoading ? (
          <p className="text-caption1 text-text-muted">正在读取训练区间…</p>
        ) : zonesError ? (
          <p role="alert" className="text-caption1 text-error">{zonesError}</p>
        ) : (
          <p className="text-caption1 text-text-muted">当前没有可用的训练区间。</p>
        )}
      </section>

      <section aria-label="跑鞋管理" className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-display-sm font-semibold text-text-primary">跑鞋</h2>
          <p className="text-caption1 text-text-muted">查看跑鞋累计里程，管理个人鞋款。</p>
        </div>
        <ShoeManager />
      </section>
      <section aria-labelledby="profile-source-title" className="space-y-3">
        <div className="space-y-1">
          <h2 id="profile-source-title" className="font-display text-display-sm font-semibold text-text-primary">数据来源与恢复</h2>
          <p className="text-caption1 text-text-muted">同步状态、近期恢复读数与训练设备。</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-title3 font-semibold text-text-primary">Intervals.icu</h3>
              <p className="mt-1 text-caption1 text-text-muted">
                {intervalSync.data?.status === "connected"
                  ? `已连接 · ${intervalSync.data.last_sync ? `最近同步于 ${new Date(intervalSync.data.last_sync).toLocaleDateString("zh-CN")}` : "等待首轮同步"}`
                  : intervalSync.loading
                    ? "正在读取连接状态…"
                    : "尚未连接训练数据源"}
              </p>
              {intervalSync.data?.last_sync_error ? (
                <p role="alert" className="mt-2 text-caption1 text-error">{intervalSync.data.last_sync_error}</p>
              ) : null}
            </div>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/settings?section=data">数据管理</Link>
            </Button>
          </Card>
          <DemoDevicesCard />
          <DemoLoadRiskCard figures={figures} recoveryIndex={recoveryIndex} />
        </div>
        <Card padding="lg" className="space-y-4">
          <div>
            <h3 className="text-title3 font-semibold text-text-primary">训练数据质量</h3>
            <p className="mt-1 text-caption1 text-text-muted">查看同步覆盖、数据完整度与缺失区间。</p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface-sunken/50 p-4 sm:p-5">
            <DataHealthSummary />
          </div>
          <Button asChild variant="outline" className="w-fit">
            <Link href="/settings?section=data">管理来源与导入文件</Link>
          </Button>
        </Card>
      </section>
    </div>
  );
}
