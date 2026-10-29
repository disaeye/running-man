"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useZoneOverrides, type ZoneOverride } from "@features/settings/hooks/useZoneOverrides";
import { useRaceResults } from "@features/settings/hooks/useRaceResults";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";
import { useAbility } from "@features/today/hooks/useAbility";
import { useLifetimeTotals } from "@features/today/hooks/useLifetimeTotals";
import { useAthleteGrade } from "@features/today/hooks/useAthleteGrade";
import { usePersonalRange } from "@features/today/hooks/usePersonalRange";
import { useWellness } from "@features/health/hooks/useWellness";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useReadiness } from "@features/today/hooks/useReadiness";
import { Card } from "@shared/ui/Card";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import {
  resolveSettingsSection,
  settingsSectionNavUrl,
  type SettingsSectionId,
} from "@shared/config/canonical-routes";
import { DemoIdentityCard } from "@features/settings/components/DemoIdentityCard";
import { DemoPhysiologyCard } from "@features/settings/components/DemoPhysiologyCard";
import { DemoRecordsWall } from "@features/settings/components/DemoRecordsWall";
import { DemoLoadRiskCard } from "@features/settings/components/DemoLoadRiskCard";
import { DemoDevicesCard } from "@features/settings/components/DemoDevicesCard";
import { SettingsTrainingParams } from "@features/settings/components/SettingsTrainingParams";
import { SettingsZones } from "@features/settings/components/SettingsZones";
import { SettingsDataSection } from "@features/settings/components/SettingsDataSection";
import { SettingsProfile } from "@features/settings/components/SettingsProfile";
import { SettingsPreferences } from "@features/settings/components/SettingsPreferences";
import { SettingsNotifications } from "@features/settings/components/SettingsNotifications";
import { SettingsSignOut } from "@features/settings/components/SettingsSignOut";
import { SettingsSectionTabs } from "@features/settings/components/SettingsSectionTabs";
import { bestSummary } from "@features/settings/lib/profile-summary";

export type AthleteProfileTabId = SettingsSectionId;

/**
 * 档案页（按 stich_demo 的 set.html 重排）。
 *
 * 上半是六块只读的信息：个人名片、生理机能与雷达、个人最好成绩、负荷与
 * 恢复监控、穿戴与数据源。下半是编辑区：生理参数与区间、数据源、账户。
 *
 * 跑鞋模块不在这张页上：跑鞋的里程只在绑定活动之后才有意义，而绑定
 * 入口在活动详情里，单独列出跑鞋墙会给出「这个数字从哪来」的疑问。
 */
/** 生理读数的窗口：与首页一致，同一个窗口取数。 */
const WINDOW_DAYS = 42;

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const targetTab = resolveSettingsSection(
    searchParams.get("section"),
    searchParams.get("tab"),
  );
  const [activeTab, setActiveTab] = useState<AthleteProfileTabId>(targetTab);
  const { profile, reload: reloadProfile } = useProfile();
  const {
    zones,
    loading: zonesLoading,
    saving: zonesSaving,
    saveOverrides,
    resetZones,
    selectScheme,
    reload: reloadZones,
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
  const activities = useActivities(range.from, range.to);
  const readiness = useReadiness();

  // Saving a threshold changes the zones derived from it. Both queries have to
  // refetch, otherwise the panel keeps showing boundaries from the old LTHR
  // while the form above says the new one was saved.
  const handleProfileSaved = () => {
    reloadProfile();
    reloadZones();
  };

  const handleTabChange = (tabId: AthleteProfileTabId) => {
    setActiveTab(tabId);
    // router.replace rather than history.replaceState: the latter does not
    // notify Next's useSearchParams, so the address bar and the rendered tab
    // disagreed until a manual reload.
    router.replace(settingsSectionNavUrl(new URLSearchParams(searchParams), tabId));
  };

  const hrZones = zones?.hr_zones ?? [];
  const paceZones = zones?.pace_zones ?? null;
  const thresholdPace = zones?.threshold_pace ?? profile?.threshold_pace ?? null;
  const hasOverrides = zones?.has_overrides ?? false;
  const hrScheme = zones?.hr_scheme ?? "hrmax";
  const hrSchemeOptions = zones?.hr_scheme_options ?? [];

  const latestWellness = wellness.data.at(-1) ?? null;
  const figures = personalRange.data?.figures ?? [];

  // 触地平衡：最近一次记录里设备上报的那一个。设备没测就没有这一项。
  const latestBalance =
    [...activities.data]
      .reverse()
      .find((activity) => activity.avg_lr_balance_pct != null)?.avg_lr_balance_pct ?? null;

  // 恢复指数：就绪分数只有在真的测到东西时才是读数，否则是中点占位值。
  const local = readiness.data?.local_readiness ?? null;
  const recoveryIndex =
    local !== null && local.data_sufficient ? Math.round(local.score) : null;

  return (
    <div className="page-stack" data-testid="athlete-profile-page">
      <DemoIdentityCard
        profile={profile}
        lifetimeDistanceM={lifetime.distance_m}
        raceCount={raceResults.data.length > 0 ? raceResults.data.length : null}
        vdot={ability.data?.vdot ?? null}
        tierLabel={grade.data?.grade?.tier ?? null}
        bestSummary={bestSummary(raceResults.data)}
      />

      <DemoPhysiologyCard
        vo2max={latestWellness?.vo2max ?? null}
        vo2maxSource={latestWellness?.vo2max != null ? "设备同步" : null}
        restingHr={zones?.resting_hr ?? profile?.resting_hr ?? null}
        lthr={zones?.lthr ?? profile?.lthr ?? null}
        thresholdPaceSPerKm={thresholdPace}
        weightKg={latestWellness?.weight ?? null}
        heightCm={profile?.height_cm ?? null}
        bodyFatPct={latestWellness?.body_fat_pct ?? null}
        figures={figures}
        windowDays={personalRange.data?.window_days ?? 90}
      />

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

      <DemoLoadRiskCard
        figures={figures}
        lrBalancePct={latestBalance}
        recoveryIndex={recoveryIndex}
      />

      <DemoDevicesCard />

      <SettingsSectionTabs activeTab={activeTab} onChange={handleTabChange} />

      {profile === null ? (
        <div className="space-y-6">
          {/* Sync stays reachable: connecting a data source is a legitimate
              first step and does not require a profile row. Everything else
              reads and writes profile fields, so it waits for a real one. */}
          {activeTab === "data" ? (
            <SettingsDataSection />
          ) : activeTab === "account" ? (
            <SettingsSignOut />
          ) : (
            <Card padding="md" className="text-center">
              <p className="text-subheadline text-text-secondary">
                无法读取运动员档案，暂不能编辑训练参数与账户设置。
              </p>
              <p className="mt-2 text-caption1 text-text-muted">
                请确认已登录且后端服务正常，然后
                <button
                  type="button"
                  onClick={reloadProfile}
                  className="ml-1 underline underline-offset-2"
                >
                  重新读取
                </button>
                。
              </p>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {activeTab === "training" && (
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <SettingsTrainingParams profile={profile} onSaved={handleProfileSaved} />
              </div>
              <div className="lg:col-span-7">
                <SettingsZones
                  hrZones={hrZones}
                  paceZones={paceZones}
                  thresholdPace={thresholdPace}
                  hrScheme={hrScheme}
                  hrSchemeOptions={hrSchemeOptions}
                  hrSchemeCitation={zones?.hr_scheme_citation ?? null}
                  unavailableRequirements={zones?.unavailable_requirements ?? []}
                  hrMax={zones?.hr_max ?? null}
                  hrMaxEstimated={zones?.hr_max_estimated ?? false}
                  lthr={zones?.lthr ?? null}
                  restingHr={zones?.resting_hr ?? null}
                  hasOverrides={hasOverrides}
                  loading={zonesLoading}
                  saving={zonesSaving}
                  onSave={async (hrOverrides: ZoneOverride[]) => saveOverrides(hrOverrides)}
                  onReset={async () => resetZones()}
                  onSelectScheme={selectScheme}
                />
              </div>
            </div>
          )}
          {activeTab === "data" && <SettingsDataSection />}
          {activeTab === "account" && (
            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
              <SettingsProfile profile={profile} onSaved={reloadProfile} />
              <SettingsPreferences profile={profile} onSaved={reloadProfile} />
              <SettingsNotifications profile={profile} onSaved={reloadProfile} />
              <SettingsSignOut />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
