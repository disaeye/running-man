"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import type { TermKey } from "@shared/config/terms";
import { getSportConfig } from "@shared/config/sport-config";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { Tag } from "@shared/ui/Badge";
import { PageCard } from "@shared/ui/Card";
import { MetricHelpTip } from "@shared/ui/MetricHelpTip";
import { MetricInlineDisclosure } from "@shared/ui/MetricInlineDisclosure";
import { Page } from "@shared/ui/PageHeader";
import { SourceTag } from "@shared/ui/SourceTag";
import { TextLink } from "@shared/ui/TextLink";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { useCurrentReadings } from "@features/health/lib/physiology-display";
import {
  ProfileGearSummary,
  ProfilePendingSetup,
  ProfilePbGrid,
  ProfileRaceSummary,
} from "@features/profile/components/ProfilePortraitCards";
import { ProfileZonesCard } from "@features/profile/components/ProfileZonesCard";
import { NoticeStrip } from "@features/profile/components/NoticeStrip";
import {
  buildPhysiologyParameters,
  type PhysiologyParameter,
} from "@features/profile/lib/physiology-parameters";
import { timezoneOffsetLabel } from "@features/profile/lib/timezone-label";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useThresholdHistory } from "@features/settings/hooks/useThresholdHistory";
import { useZoneOverrides } from "@features/settings/hooks/useZoneOverrides";
import { useAbility } from "@features/today/hooks/useAbility";
import { useAthleteGrade } from "@features/today/hooks/useAthleteGrade";
import { useLifetimeTotals } from "@features/today/hooks/useLifetimeTotals";
import { tierLabel } from "@features/today/lib/grade-label";

const PROFILE_PARAM_TERMS: Record<string, TermKey> = {
  vo2max: "VO2MAX",
  lthr: "LTHR",
  threshold_pace: "THRESHOLD_PACE",
  resting_hr: "RHR",
};

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
  const gradeQuery = useAthleteGrade();
  const lifetime = useLifetimeTotals();
  const ability = useAbility();
  const sync = useSyncDetail("intervals_icu");

  const timezone = profile?.timezone ?? "UTC";
  const readings = useCurrentReadings();

  const parameters = useMemo(
    () =>
      buildPhysiologyParameters({
        entries: thresholds.entries,
        readings,
        lthrFallback: zones?.lthr ?? profile?.lthr ?? null,
        hrMaxFallback: zones?.hr_max ?? profile?.hr_max ?? null,
        thresholdPaceFallback: zones?.threshold_pace ?? profile?.threshold_pace ?? null,
        restingHrFallback: profile?.resting_hr ?? zones?.resting_hr ?? null,
      }),
    [
      thresholds.entries,
      readings,
      zones?.lthr,
      zones?.hr_max,
      zones?.threshold_pace,
      zones?.resting_hr,
      profile?.lthr,
      profile?.hr_max,
      profile?.threshold_pace,
      profile?.resting_hr,
    ],
  );

  const sport = profile?.preferred_sport ? getSportConfig(profile.preferred_sport).label : "跑步";
  const grade = gradeQuery.data?.grade ?? null;
  const ageGradedPct = gradeQuery.data?.age_graded_pct ?? null;
  const bodyNotes = [
    readings.weight ? `体重 ${readings.weight.value.toFixed(1)} kg` : null,
    readings.bodyFatPct ? `体脂 ${readings.bodyFatPct.value.toFixed(1)}%` : null,
    profile?.height_cm ? `身高 ${Math.round(profile.height_cm)} cm` : null,
    ability.data?.vdot ? `VDOT ${ability.data.vdot.toFixed(1)}` : null,
    lifetime.distance_m != null ? `累计 ${Math.round(lifetime.distance_m / 1000)} km` : null,
  ].filter(Boolean);

  const connected = sync.data?.status === "connected";
  const lastSyncText = sync.data?.last_sync
    ? new Date(sync.data.last_sync).toLocaleDateString("zh-CN")
    : NO_VALUE;

  return (
    <Page
      title="我的"
      eyebrow={
        <span className="inline-flex items-start gap-1">
          <span>{timezone} · {timezoneOffsetLabel(timezone)}</span>
          <MetricHelpTip label="时区" text="时区用于判定跨午夜活动的日期归属，可在「设置 → 账户」中修改。" />
        </span>
      }
    >
      <div data-testid="athlete-profile-page" className="space-y-4">
        <PageCard>
          <div className="flex items-center gap-3">
            <div className="num grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
              {profile?.name?.trim().slice(0, 1) || "跑"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{profile?.name?.trim() || "未设置姓名"}</h2>
                {grade ? (
                  <Tag tone="primary">
                    {tierLabel(grade.tier)}
                    {ageGradedPct != null ? ` · ${ageGradedPct.toFixed(1)}%` : ""}
                  </Tag>
                ) : null}
              </div>
              <div className="mt-1 text-subheadline text-muted-foreground">
                {sport} ·{" "}
                {profile?.weekly_training_days != null
                  ? `每周训练 ${profile.weekly_training_days} 天`
                  : "每周训练天数未记录"}
              </div>
              {bodyNotes.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-caption1 tabular-nums text-text-secondary">
                  {bodyNotes.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <Link
              href="/settings?section=account"
              className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-secondary px-3 text-caption1 text-text-secondary hover:bg-surface-active"
              aria-label="设置"
            >
              <Settings className="h-4 w-4" aria-hidden />
              设置
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2.5 text-caption1 text-text-muted">
            <span>Intervals.icu {connected ? "已连接" : "尚未连接"} · 最近同步 {lastSyncText}</span>
            <TextLink href="/settings?section=data" arrow>数据源与同步</TextLink>
          </div>
          <div className="mt-2">
            <ProfilePendingSetup />
          </div>
        </PageCard>

        <NoticeStrip />

        <ProfilePbGrid />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          <div className="space-y-4 lg:col-span-6">
            <PageCard
              title="生理参数"
              action={<TextLink href="/settings?section=training" arrow>调整与测算</TextLink>}
            >
              <div className="divide-y divide-border pb-2">
                {parameters.map((parameter) => (
                  <ParameterRow key={parameter.key} parameter={parameter} />
                ))}
              </div>
            </PageCard>

          </div>

          <div className="space-y-4 lg:col-span-6">
            <ProfileZonesCard zones={zones} fallbackThresholdPace={profile?.threshold_pace ?? null} />
            <ProfileGearSummary />
            <ProfileRaceSummary />
          </div>
        </div>
      </div>
    </Page>
  );
}

function ParameterRow({ parameter }: { parameter: PhysiologyParameter }) {
  const termKey = PROFILE_PARAM_TERMS[parameter.key];
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5"
      data-testid={`physiology-${parameter.key}`}
    >
      <div className="min-w-0">
        <div className="flex items-center text-subheadline">
          <span>{parameter.label}</span>
          {termKey ? <MetricInlineDisclosure termKey={termKey} /> : null}
        </div>
        <div className="text-caption1 text-muted-foreground">
          {parameter.dateLabel ?? "尚未记录"}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <span className="num font-mono text-title3 font-semibold tabular-nums">
          {parameter.value ?? NO_VALUE}
        </span>
        {parameter.source ? <SourceTag source={parameter.source} /> : null}
      </div>
    </div>
  );
}
