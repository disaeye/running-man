"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useZoneOverrides, type ZoneOverride } from "@features/settings/hooks/useZoneOverrides";
import { AthleteProfileSummary } from "@features/settings/components/AthleteProfileSummary";
import { SettingsTrainingParams } from "@features/settings/components/SettingsTrainingParams";
import { SettingsZones } from "@features/settings/components/SettingsZones";
import { SettingsPhysiology } from "@features/settings/components/SettingsPhysiology";
import { SettingsDataSection } from "@features/settings/components/SettingsDataSection";
import { SettingsProfile } from "@features/settings/components/SettingsProfile";
import { SettingsPreferences } from "@features/settings/components/SettingsPreferences";
import { SettingsNotifications } from "@features/settings/components/SettingsNotifications";
import { SettingsSignOut } from "@features/settings/components/SettingsSignOut";
import { Activity, RefreshCw, UserCheck } from "lucide-react";
import { Card } from "@shared/ui/Card";
import {
  resolveSettingsSection,
  settingsSectionNavUrl,
  type SettingsSectionId,
} from "@shared/config/canonical-routes";

export type AthleteProfileTabId = SettingsSectionId;

/**
 * The page's three panels, keyed by the **canonical** section id.
 *
 * These ids come from `shared/config/canonical-routes.ts` (`data | training |
 * account`) and are what `?section=` carries, what `next.config.js` redirects
 * emit (`/data` → `?section=data`) and what other pages link with. The page
 * previously used its own `physiology | sync | account` vocabulary: it *read*
 * `?section=` but *wrote* `?tab=`, so `?section=training` from a deep link fell
 * through to the first tab and a refresh lost the selection.
 */
const PROFILE_TABS = [
  { id: "training", label: "生理与区间", icon: Activity, desc: "LTHR · 配速5区 · 生理参数" },
  { id: "data",     label: "数据源与同步", icon: RefreshCw, desc: "Intervals.icu · 导入导出" },
  { id: "account",  label: "账户与偏好", icon: UserCheck, desc: "个人资料 · 界面 · 通知" },
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
  const { zones, loading: zonesLoading, saving: zonesSaving, saveOverrides, resetZones, selectScheme } = useZoneOverrides();

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
      <section className="flex flex-wrap items-end justify-between gap-6 border-b border-border-subtle pb-7" aria-labelledby="profile-title">
        <div><p className="mb-3 font-mono text-caption2 uppercase tracking-[0.24em] text-primary">PROFILE / CONFIGURATION</p><h1 id="profile-title" className="text-display-md text-text-primary">运动员档案</h1><p className="mt-3 max-w-xl text-subheadline text-text-secondary">让系统了解你的身体，也让每一个区间有据可依。</p></div>
        <div className="hidden rounded-lg border border-border-default bg-surface-sunken/60 px-4 py-3 sm:block"><p className="font-mono text-caption2 uppercase tracking-[0.16em] text-text-muted">ATHLETE STATUS</p><p className={`mt-1 text-subheadline ${profile ? "text-primary" : "text-warning"}`}>{profileLoading ? "LOADING" : profile ? "PROFILE ONLINE" : "PROFILE UNAVAILABLE"}</p></div>
      </section>
      <div className="glass-surface rounded-xl p-5 sm:p-6"><AthleteProfileSummary profile={profile} loading={profileLoading} /></div>
      <div className="flex flex-wrap gap-2 border-b border-border-subtle pb-3">
        {PROFILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`settings-section-${tab.id}`}
              onClick={() => handleTabChange(tab.id as AthleteProfileTabId)}
              className={`focus-ring flex min-h-11 items-center gap-2 rounded-lg px-4 py-2.5 text-caption1 font-semibold transition-colors ${isActive ? "bg-primary text-on-primary" : "border border-border-default bg-surface-card text-text-secondary hover:bg-surface-overlay hover:text-text-primary"}`}
              aria-pressed={isActive}
            >
              <Icon className="size-4" />
              <span data-testid={`settings-section-label-${tab.id}`}>{tab.label}</span>
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
                  onSaved={reloadProfile}
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
            <SettingsPhysiology profile={profile} onSaved={reloadProfile} />
          </div>
        )}
        {activeTab === "data" && <SettingsDataSection />}
        {activeTab === "account" && (
          <div className="space-y-6">
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
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  );
}
