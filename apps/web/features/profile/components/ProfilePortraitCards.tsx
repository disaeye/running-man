"use client";

import Link from "next/link";
import { Award, ChevronRight } from "lucide-react";
import useSWR from "swr";
import { Badge, Tag } from "@shared/ui/Badge";
import { PageCard } from "@shared/ui/Card";
import { Bar } from "@shared/ui/MetricBar";
import { TextLink } from "@shared/ui/TextLink";
import { apiFetch } from "@shared/lib/api";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { PersonalRecord } from "@features/performance/components/PerformancePRs";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";
import { useRaceResults } from "@features/settings/hooks/useRaceResults";
import { formatRaceTime } from "@features/settings/lib/race-time";
import { eventLabel } from "@features/today/lib/grade-label";

interface ShoeSummary {
  readonly id: string;
  readonly name: string;
  readonly mileage_m: number;
  readonly retirement_alert: boolean;
  readonly retired_at: string | null;
}

const RETIREMENT_KM = 800;

const CANONICAL_PBS = [
  {
    key: "5k",
    label: "5K",
    match: (r: PersonalRecord) => r.type === "fastest_5000m" || r.type.includes("5000") || r.type.includes("5k"),
  },
  {
    key: "10k",
    label: "10K",
    match: (r: PersonalRecord) => r.type === "fastest_10000m" || r.type.includes("10000") || r.type.includes("10k"),
  },
  {
    key: "hm",
    label: "半马",
    match: (r: PersonalRecord) =>
      r.type === "fastest_21097m" || r.type.includes("21097") || r.type.includes("half") || r.label.includes("半马"),
  },
  {
    key: "fm",
    label: "全马",
    match: (r: PersonalRecord) =>
      r.type === "fastest_42195m" ||
      r.type.includes("42195") ||
      (r.type.includes("marathon") && !r.type.includes("half")) ||
      r.label.includes("全马"),
  },
] as const;

export function ProfilePbGrid() {
  const { data, loading, error } = usePersonalRecords();

  return (
    <PageCard
      testId="profile-pb-grid"
      title="个人最佳成绩 · PB"
      action={<TextLink href="/goals" arrow>查看目标</TextLink>}
    >
      {loading ? (
        <p className="text-caption1 text-text-muted">正在读取个人最佳成绩…</p>
      ) : error ? (
        <p role="alert" className="text-caption1 text-error">无法读取个人最佳成绩：{error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {CANONICAL_PBS.map((slot) => {
            const record = data.find((item) => item.sport === "Run" && slot.match(item)) ?? data.find(slot.match) ?? null;
            if (!record) {
              return (
                <div key={slot.key} className="flex min-h-24 flex-col justify-between rounded-xl bg-surface-overlay/60 p-3">
                  <span className="text-caption1 text-text-muted">{slot.label}</span>
                  <span className="text-subheadline font-medium text-text-muted">{NO_VALUE}</span>
                  <span className="text-caption1 text-text-muted">暂无达标记录</span>
                </div>
              );
            }
            return (
              <Link
                key={slot.key}
                href={`/activities/${record.activityId}`}
                className="card-spotlight flex min-h-24 flex-col justify-between rounded-xl bg-surface-overlay p-3 transition-colors hover:bg-surface-active"
              >
                <div className="flex items-center justify-between gap-1 text-caption1 text-text-muted">
                  <span className="inline-flex items-center gap-1 font-medium text-text-secondary">
                    <Award className="size-3.5 text-warn" aria-hidden="true" />
                    {slot.label}
                  </span>
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                </div>
                <div className="num font-mono text-title2 font-bold tabular-nums text-text-primary">
                  {record.value_formatted}
                </div>
                <div className="num font-mono text-caption1 tabular-nums text-text-muted">{record.date}</div>
              </Link>
            );
          })}
        </div>
      )}
    </PageCard>
  );
}

/** 跑鞋与比赛成绩都没有记录时，两张空卡换成一行入口，设置入口仍然可达。 */
export function ProfilePendingSetup() {
  const shoes = useSWR<ShoeSummary[]>(
    ["/gear/shoes"],
    () => apiFetch<ShoeSummary[]>("/gear/shoes"),
  );
  const races = useRaceResults();
  const activeShoes = (shoes.data ?? []).filter((shoe) => !shoe.retired_at);
  const shoesEmpty = !shoes.isLoading && !shoes.error && activeShoes.length === 0;
  const racesEmpty = !races.loading && !races.error && races.data.length === 0;
  if (!shoesEmpty && !racesEmpty) return null;
  const missing = [shoesEmpty ? "跑鞋与装备" : null, racesEmpty ? "比赛成绩" : null].filter(Boolean);
  return (
    <p data-testid="profile-pending-setup" className="text-caption1 text-text-muted">
      尚未登记{missing.join("、")} <TextLink href="/settings?section=account" arrow>去登记</TextLink>
    </p>
  );
}

export function ProfileGearSummary() {
  const { data: shoes = [], isLoading, error } = useSWR<ShoeSummary[]>(
    ["/gear/shoes"],
    () => apiFetch<ShoeSummary[]>("/gear/shoes"),
  );
  const activeShoes = shoes.filter((shoe) => !shoe.retired_at).slice(0, 4);
  // 没有登记跑鞋时整卡不出现：空卡不占位，入口在「设置 → 账户」。
  if (!isLoading && !error && activeShoes.length === 0) return null;

  return (
    <PageCard
      testId="profile-gear-summary"
      title="跑鞋与装备"
      action={<TextLink href="/settings?section=account" arrow>管理装备</TextLink>}
    >
      {isLoading ? (
        <p className="text-caption1 text-text-muted">正在读取跑鞋…</p>
      ) : error ? (
        <p role="alert" className="text-caption1 text-error">无法读取跑鞋数据</p>
      ) : (
        <ul className="space-y-2.5">
          {activeShoes.map((shoe) => {
            const km = Math.round(shoe.mileage_m / 1000);
            const remaining = Math.max(0, RETIREMENT_KM - km);
            return (
              <li key={shoe.id} className="space-y-2 rounded-xl bg-surface-overlay p-3">
                <div className="flex items-center justify-between gap-2 text-subheadline">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-text-primary">
                    <span className="break-words">{shoe.name}</span>
                    {shoe.retirement_alert ? <Tag tone="warn">接近退役</Tag> : null}
                  </span>
                  <span className="num shrink-0 font-mono text-caption1 tabular-nums text-text-muted">
                    {km} / {RETIREMENT_KM} km
                  </span>
                </div>
                <Bar value={km} max={RETIREMENT_KM} tone={shoe.retirement_alert ? "bg-warn" : "bg-primary"} />
                <div className="text-caption1 text-text-muted">
                  {remaining > 0 ? `预计还可跑约 ${remaining} km` : "已达建议更换里程"}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageCard>
  );
}

export function ProfileRaceSummary() {
  const { data, loading, error } = useRaceResults();
  const recent = data.slice(0, 4);
  // 没有登记比赛成绩时整卡不出现：空卡不占位，入口在「设置 → 账户」。
  if (!loading && !error && recent.length === 0) return null;

  return (
    <PageCard
      testId="profile-race-summary"
      title="比赛成绩"
      action={<TextLink href="/settings?section=account" arrow>管理比赛成绩</TextLink>}
    >
      {loading ? (
        <p className="text-caption1 text-text-muted">正在读取比赛成绩…</p>
      ) : error ? (
        <p role="alert" className="text-caption1 text-error">{error}</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {recent.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{eventLabel(row.distance_category)}</Badge>
                  <span className="truncate text-subheadline font-medium text-text-primary">{row.event_name}</span>
                </div>
                <div className="num mt-0.5 font-mono text-caption1 tabular-nums text-text-muted">{row.race_date}</div>
              </div>
              <span className="num shrink-0 font-mono text-subheadline font-semibold tabular-nums text-text-primary">
                {formatRaceTime(row.time_s)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PageCard>
  );
}
