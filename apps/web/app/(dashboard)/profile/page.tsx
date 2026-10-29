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
import { useActivities } from "@features/activity/hooks/useActivities";
import { useReadiness } from "@features/today/hooks/useReadiness";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { Button } from "@shared/ui/button";
import { PageHeader } from "@shared/ui/PageHeader";
import { DemoIdentityCard } from "@features/settings/components/DemoIdentityCard";
import { DemoPhysiologyCard } from "@features/settings/components/DemoPhysiologyCard";
import { DemoRecordsWall } from "@features/settings/components/DemoRecordsWall";
import { DemoLoadRiskCard } from "@features/settings/components/DemoLoadRiskCard";
import { DemoDevicesCard } from "@features/settings/components/DemoDevicesCard";
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
  const { zones } = useZoneOverrides();
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

  const latestWellness = wellness.data.at(-1) ?? null;
  const figures = personalRange.data?.figures ?? [];
  const latestBalance =
    [...activities.data]
      .reverse()
      .find((activity) => activity.avg_lr_balance_pct != null)?.avg_lr_balance_pct ?? null;
  const local = readiness.data?.local_readiness ?? null;
  const recoveryIndex =
    local !== null && local.data_sufficient ? Math.round(local.score) : null;

  return (
    <div className="page-stack" data-testid="athlete-profile-page">
      <PageHeader
        title="档案"
        description="查看个人成绩、生理指标与近期训练状态。"
        action={
          <Button asChild variant="outline">
            <Link href="/settings">
              <Settings2 aria-hidden="true" />
              设置
            </Link>
          </Button>
        }
      />

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
        thresholdPaceSPerKm={zones?.threshold_pace ?? profile?.threshold_pace ?? null}
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
    </div>
  );
}
