"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useZoneOverrides, type ZoneOverride } from "@features/settings/hooks/useZoneOverrides";
import { resolveSettingsSection, settingsSectionNavUrl } from "@shared/config/canonical-routes";
import type { SettingsSectionId } from "@shared/config/canonical-routes";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/Card";
import { PageHeader } from "@shared/ui/PageHeader";
import { SettingsTrainingParams } from "@features/settings/components/SettingsTrainingParams";
import { SettingsZones } from "@features/settings/components/SettingsZones";
import { SettingsDataSection } from "@features/settings/components/SettingsDataSection";
import { SettingsProfile } from "@features/settings/components/SettingsProfile";
import { SettingsPreferences } from "@features/settings/components/SettingsPreferences";
import { SettingsNotifications } from "@features/settings/components/SettingsNotifications";
import { SettingsSignOut } from "@features/settings/components/SettingsSignOut";
import { SettingsSectionTabs } from "@features/settings/components/SettingsSectionTabs";

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
  const activeTab = resolveSettingsSection(
    searchParams.get("section"),
    searchParams.get("tab"),
  );
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

  const handleProfileSaved = () => {
    reloadProfile();
    reloadZones();
  };

  const handleTabChange = (tabId: SettingsSectionId) => {
    router.replace(settingsSectionNavUrl(new URLSearchParams(searchParams), tabId));
  };

  const thresholdPace = zones?.threshold_pace ?? profile?.threshold_pace ?? null;
  const hasOverrides = zones?.has_overrides ?? false;

  return (
    <div className="page-stack" data-testid="settings-page">
      <PageHeader
        title="设置"
        description="管理训练参数、数据来源、个人信息与账户偏好。"
        action={
          <Button asChild variant="outline">
            <Link href="/profile">
              <ArrowLeft aria-hidden="true" />
              我的
            </Link>
          </Button>
        }
      />

      <SettingsSectionTabs activeTab={activeTab} onChange={handleTabChange} />

      {profile === null ? (
        <div className="space-y-6">
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
                  hrZones={zones?.hr_zones ?? []}
                  paceZones={zones?.pace_zones ?? null}
                  thresholdPace={thresholdPace}
                  hrScheme={zones?.hr_scheme ?? "hrmax"}
                  hrSchemeOptions={zones?.hr_scheme_options ?? []}
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
