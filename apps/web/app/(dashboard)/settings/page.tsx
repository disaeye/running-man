"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useZoneOverrides, type ZoneOverride } from "@features/settings/hooks/useZoneOverrides";
import { AthleteIdentityCard } from "@features/settings/components/AthleteIdentityCard";
import { PhysiologyCards } from "@features/settings/components/PhysiologyCards";
import { SettingsTrainingParams } from "@features/settings/components/SettingsTrainingParams";
import { SettingsZones } from "@features/settings/components/SettingsZones";
import { SettingsDataSection } from "@features/settings/components/SettingsDataSection";
import { RaceResultsSection } from "@features/settings/components/RaceResultsSection";
import { LoadRiskCard } from "@features/settings/components/LoadRiskCard";
import { PersonalRecordsGrid } from "@features/settings/components/PersonalRecordsGrid";
import { GearSection } from "@features/settings/components/GearSection";
import { SettingsProfile } from "@features/settings/components/SettingsProfile";
import { SettingsPreferences } from "@features/settings/components/SettingsPreferences";
import { SettingsNotifications } from "@features/settings/components/SettingsNotifications";
import { SettingsSignOut } from "@features/settings/components/SettingsSignOut";
import { Card } from "@shared/ui/Card";
import {
  resolveSettingsSection,
  settingsSectionNavUrl,
  type SettingsSectionId,
} from "@shared/config/canonical-routes";

export type AthleteProfileTabId = SettingsSectionId;

/**
 * The page's three sections, keyed by the **canonical** section id.
 *
 * These ids come from `shared/config/canonical-routes.ts` (`data | training |
 * account`) and are what `?section=` carries, what `next.config.js` redirects
 * emit (`/data` → `?section=data`) and what other pages link with. The page
 * previously used its own `physiology | sync | account` vocabulary: it *read*
 * `?section=` but *wrote* `?tab=`, so `?section=training` from a deep link fell
 * through to the first tab and a refresh lost the selection.
 */
const PROFILE_TABS = [
  { id: "training", label: "生理与区间" },
  { id: "data", label: "数据源与同步" },
  { id: "account", label: "账户与偏好" },
] as const;

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Resolved through the shared canonical helper, which also accepts the legacy
  // ?tab= form and the `profile` → `account` alias.
  const targetTab = resolveSettingsSection(
    searchParams.get("section"),
    searchParams.get("tab"),
  );
  const [activeTab, setActiveTab] = useState<AthleteProfileTabId>(targetTab);
  const { profile, loading: profileLoading, reload: reloadProfile } = useProfile();
  // No placeholder profile. Components below read name/email/thresholds and
  // write them back on save; handing them invented values (HRmax 188, LTHR 168,
  // 4'20"/km) made an unreachable API look like a configured athlete and let a
  // save persist those numbers as real thresholds. Until the profile loads,
  // the tabs that need it are replaced by an explanatory state.
  const { zones, loading: zonesLoading, saving: zonesSaving, saveOverrides, resetZones, selectScheme, reload: reloadZones } = useZoneOverrides();

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

  // Zone tables come from the API, which resolves thresholds per the athlete's
  // chosen scheme. This page used to synthesise five zones from `hr_max || 188`
  // and pass `ftp ?? 250` / `threshold_pace ?? 260` — plausible-looking numbers
  // unrelated to the athlete, which then flowed into TSS and intensity advice.
  // When the API cannot build zones it now says so, and the UI shows that.
  const hrZones = zones?.hr_zones ?? [];
  const paceZones = zones?.pace_zones ?? null;
  const thresholdPace = zones?.threshold_pace ?? profile?.threshold_pace ?? null;
  const hasOverrides = zones?.has_overrides ?? false;
  const hrScheme = zones?.hr_scheme ?? "hrmax";
  const hrSchemeOptions = zones?.hr_scheme_options ?? [];

  return (
    <div className="page-stack" data-testid="athlete-profile-page">
      <AthleteIdentityCard profile={profile} loading={profileLoading} />
      <PhysiologyCards profile={profile} />
      <div
        className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-overlay p-1 sm:inline-flex sm:flex-wrap"
        role="group"
        aria-label="档案分区"
      >
        {PROFILE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`settings-section-${tab.id}`}
              onClick={() => handleTabChange(tab.id as AthleteProfileTabId)}
              className={`focus-ring flex min-h-11 min-w-0 items-center justify-center rounded-lg px-2 text-caption1 font-medium transition-colors sm:px-4 ${isActive ? "bg-surface-card text-text-primary shadow-[var(--shadow-sm)]" : "text-text-secondary hover:text-text-primary"}`}
              aria-pressed={isActive}
            >
              <span className="truncate" data-testid={`settings-section-label-${tab.id}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
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
                <button type="button" onClick={reloadProfile} className="ml-1 underline underline-offset-2">
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
          <div className="space-y-6">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <SettingsTrainingParams
                  profile={profile}
                  onSaved={handleProfileSaved}
                />
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
                  onSave={async (hrOverrides: ZoneOverride[]) =>
                    saveOverrides(hrOverrides)
                  }
                  onReset={async () => resetZones()}
                  onSelectScheme={selectScheme}
                />
              </div>
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
      {/* 下面四块都只读接口数据、不读运动员档案：档案读取失败时上面显示
          错误卡，这里照常可用。顺序是：录入成绩 → 负荷风险 → 个人最好
          成绩 → 跑鞋。 */}
      {activeTab === "training" && (
        <>
          <RaceResultsSection />
          <LoadRiskCard />
          <PersonalRecordsGrid />
          <GearSection />
        </>
      )}
    </div>
  );
}
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  );
}
