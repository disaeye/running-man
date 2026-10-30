"use client";

import Link from "next/link";
import type { UserProfile } from "@shared/lib/auth";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { countRecordedThresholds } from "../lib/thresholds";

import { Stat, StatGrid } from "@shared/ui/Section";

interface Props {
  profile: UserProfile | null;
  loading?: boolean;
  /** Show the missing-threshold link; on the section that fills them it repeats. */
  showThresholdHint: boolean;
}

/**
 * Who this profile belongs to, and the four numbers the zone maths reads.
 *
 * The identity line lives in the page header; the numbers are the page's stat
 * grid, so the profile page opens the way every other page does — identity,
 * then the four numbers, then the sections that edit them.
 */
export function AthleteProfileSummary({ profile, loading, showThresholdHint }: Props) {
  if (loading) {
    return <p className="text-caption1 text-text-muted">正在读取档案</p>;
  }
  if (profile === null) {
    return null;
  }

  const recorded = countRecordedThresholds(profile);
  const birthYear = profile.dob ? new Date(profile.dob).getFullYear() : null;
  const age = birthYear === null ? null : Math.max(0, new Date().getFullYear() - birthYear);
  const identity = [
    profile.name || "未命名运动员",
    profile.email,
    profile.sex ? (profile.sex === "male" ? "男" : "女") : null,
    age !== null ? `${age} 岁` : null,
    profile.timezone,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-1.5">
      <p className="text-caption1 text-text-secondary">{identity.join(" · ")}</p>
      {recorded < 4 && showThresholdHint && (
        <p className="text-caption1 text-text-muted">
          缺少 {4 - recorded} 项阈值设置，对应的心率和配速区间无法计算。
          <Link href="/settings?section=training" className="ml-1 font-medium text-accent-strong hover:underline">
            去填写
          </Link>
        </p>
      )}
    </div>
  );
}

/** The four thresholds as the page's stat grid. Missing values print NO_VALUE. */
export function ThresholdStats({ profile }: { readonly profile: UserProfile | null }) {
  if (profile === null) {
    return null;
  }

  const readings = [
    {
      label: "静息心率",
      value: profile.resting_hr == null ? NO_VALUE : `${profile.resting_hr}`,
      unit: HEART_RATE_UNIT,
    },
    {
      label: "乳酸阈心率",
      value: profile.lthr == null ? NO_VALUE : `${profile.lthr}`,
      unit: HEART_RATE_UNIT,
    },
    {
      label: "阈值配速",
      value:
        profile.threshold_pace == null
          ? NO_VALUE
          : formatPaceFromSeconds(profile.threshold_pace),
      unit: "/km",
    },
    {
      label: "最大心率",
      value: profile.hr_max == null ? NO_VALUE : `${profile.hr_max}`,
      unit: HEART_RATE_UNIT,
    },
  ];

  return (
    <StatGrid testId="profile-thresholds">
      {readings.map((reading) => (
        <Stat key={reading.label} label={reading.label} value={reading.value} unit={reading.unit} />
      ))}
    </StatGrid>
  );
}
