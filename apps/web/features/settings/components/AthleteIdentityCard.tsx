"use client";

import { useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { MetricStrip } from "@shared/ui/MetricStrip";
import { getSportConfig } from "@shared/config/sport-config";
import type { UserProfile } from "@shared/lib/auth";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { useAthleteGrade } from "@features/today/hooks/useAthleteGrade";
import { useLifetimeTotals } from "@features/today/hooks/useLifetimeTotals";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { tierLabel } from "@features/today/lib/grade-label";
import { trainingStreak } from "@features/today/lib/training-streak";

/** 缺值文案。没同步到的一天和练了 0 次的一天，眼睛要用两种方式读。 */
const UNRECORDED = "未记录";

/** 连续周数最多往回看 26 周：再长读的就是履历，不是当前还在延续的连续。 */
const STREAK_WEEKS = 26;

interface Props {
  readonly profile: UserProfile | null;
  readonly loading: boolean;
}

/**
 * 周岁。`dob` 是 `YYYY-MM-DD`，按字符串拆年月日再和今天比，
 * 不走 `new Date(dob)`——那会把日期当成 UTC 午夜，负时区上恰好漂到前一天，
 * 生日当天的年龄会晚一天才涨。
 */
function ageFromDob(dob: string | null, now: Date = new Date()): number | null {
  if (!dob) return null;
  const [year, month, day] = dob.slice(0, 10).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const birthdayPassed =
    now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  const age = now.getFullYear() - year - (birthdayPassed ? 0 : 1);
  return age >= 0 ? age : null;
}

/**
 * 每周训练天数。接口这一列可空（后端 schema 是 `int | None`），
 * 空着和 0 都不是答案，所以两种都写「未设置」，不印数字。
 */
function weeklyDaysLabel(days: number | null | undefined): string {
  return days == null || days <= 0 ? "每周训练天数未设置" : `每周 ${days} 天`;
}

/**
 * 档案页顶部的身份卡：叫什么、是什么水平、一共练了多少。
 *
 * 名字是这一页唯一的 `<h1>`（`data-page-title`）——顶部原来那条 `PageHeader`
 * 拆掉后，手机上的紧凑标题条仍要有个标题可盯，所以名字直接兼任页标题。
 *
 * 等级徽章只在接口真的给出档位时出现，没有档位就整块不渲染，
 * 不留一个空槽位——「还没比赛」不该看起来像「等级加载失败」。
 * 三格累计量缺值写「未记录」，不写 0。
 */
export function AthleteIdentityCard({ profile, loading }: Props) {
  const timezone = useAthleteTimezone();
  const streakRange = useMemo(
    () => athleteRange(STREAK_WEEKS * 7, timezone),
    [timezone],
  );
  const lifetime = useLifetimeTotals();
  const weekly = useWeeklyProgress(streakRange.from, streakRange.to);
  const grade = useAthleteGrade();

  const tier = grade.data?.grade?.tier ?? null;
  const name = profile?.name?.trim() || "运动员档案";

  // 读取中的档案还不算数：这时既没有身份行也没有累计量，只留标题，
  // 免得三格「未记录」先把「正在读」说成「你没练过」。
  const ready = profile !== null && !loading;
  const distanceKm =
    lifetime.distance_m == null ? UNRECORDED : (lifetime.distance_m / 1000).toFixed(1);
  const sessions =
    lifetime.activity_count == null ? UNRECORDED : String(lifetime.activity_count);
  const streak = weekly.weeks.length > 0 ? trainingStreak(weekly.weeks) : null;

  const age = profile ? ageFromDob(profile.dob) : null;
  const meta = profile
    ? [
        getSportConfig(profile.preferred_sport).label,
        age == null ? "未填写出生日期" : `${age} 岁`,
        weeklyDaysLabel(profile.weekly_training_days),
      ]
    : [];

  return (
    <Card padding="md" data-testid="athlete-identity-card">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1
          data-page-title
          className="min-w-0 truncate text-title2 font-semibold tracking-tight text-text-primary"
        >
          {name}
        </h1>
        {tier == null ? null : (
          <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-caption1 font-medium text-accent-foreground">
            {tierLabel(tier)}
          </span>
        )}
      </div>

      {ready ? (
        <p className="mt-1 text-caption1 text-text-muted">{meta.join(" · ")}</p>
      ) : null}

      {ready ? (
        <div className="mt-4">
          <MetricStrip
            columns={3}
            testId="athlete-identity-totals"
            items={[
              { label: "累计里程", value: distanceKm, unit: "km" },
              { label: "训练次数", value: sessions, unit: "次" },
              {
                label: "连续周数",
                value: streak == null ? UNRECORDED : String(streak),
                unit: "周",
              },
            ]}
          />
        </div>
      ) : null}
    </Card>
  );
}
