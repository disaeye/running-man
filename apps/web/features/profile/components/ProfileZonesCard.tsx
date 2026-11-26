"use client";

import { useState } from "react";
import { Badge } from "@shared/ui/Badge";
import { PageCard } from "@shared/ui/Card";
import { Segmented } from "@shared/ui/SegmentedControl";
import { TextLink } from "@shared/ui/TextLink";
import { PaceZoneList } from "@features/settings/components/PaceZoneList";
import { buildHeartRateZones } from "@features/profile/lib/heart-rate-zones";
import type { ZonesResponseView } from "@features/settings/hooks/useZoneOverrides";
import { formatPaceFromSeconds } from "@shared/lib/format";

const REQUIREMENT_LABEL: Record<string, string> = {
  hr_max: "最大心率",
  lthr: "乳酸阈心率",
  resting_hr: "静息心率",
};

type ZoneTab = "hr" | "pace";

const ZONE_TABS: readonly { value: ZoneTab; label: string }[] = [
  { value: "hr", label: "心率区间" },
  { value: "pace", label: "配速区间" },
];

interface ProfileZonesCardProps {
  readonly zones: ZonesResponseView | null;
  readonly fallbackThresholdPace: number | null;
}

/** 我的页面训练区间卡片：采用「心率区间 | 配速区间」分段切换，避免双区间同屏拉长页面。 */
export function ProfileZonesCard({ zones, fallbackThresholdPace }: ProfileZonesCardProps) {
  const [tab, setTab] = useState<ZoneTab>("hr");
  const heartRateZones = buildHeartRateZones(zones?.hr_zones ?? null);
  const unavailableRequirements = zones?.unavailable_requirements ?? [];
  const paceZones = zones?.pace_zones ?? [];
  const thresholdPace = zones?.threshold_pace ?? fallbackThresholdPace;

  return (
    <PageCard
      title="心率与配速区间"
      action={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {tab === "hr" && zones?.has_overrides ? <Badge variant="info">已自定义心率边界</Badge> : null}
          {tab === "hr" && zones?.hr_max_estimated ? <Badge variant="neutral">最大心率按年龄估算</Badge> : null}
          <span className="num text-caption1 text-muted-foreground">
            {tab === "hr"
              ? (zones?.hr_scheme_label ?? "按当前生理阈值划分")
              : thresholdPace != null
                ? `阈值配速 ${formatPaceFromSeconds(Math.round(thresholdPace))}/km`
                : "需设置阈值配速"}
          </span>
        </div>
      }
    >
      <div className="mb-3">
        <Segmented options={ZONE_TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "hr" ? (
        heartRateZones.length > 0 ? (
          <ul className="space-y-2">
            {heartRateZones.map((zone) => (
              <li
                key={zone.zone}
                className="grid grid-cols-[0.375rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border-subtle bg-surface-overlay/55 px-3 py-2 text-subheadline sm:grid-cols-[0.375rem_minmax(0,1fr)_5rem_7.25rem]"
              >
                <span className={`h-6 w-1.5 rounded-full ${zone.color}`} aria-hidden />
                <span className="min-w-0 truncate font-medium text-text-primary">{zone.name}</span>
                <div
                  aria-hidden="true"
                  className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken sm:block"
                >
                  <div
                    className={`h-full rounded-full ${zone.color}`}
                    style={{ width: `${Math.min(100, zone.zone * 20)}%` }}
                  />
                </div>
                <span className="num w-full text-right font-mono text-subheadline font-semibold tabular-nums text-text-primary">
                  {zone.range}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-caption1 text-warning">
            {unavailableRequirements.length > 0
              ? `当前方案还需要：${unavailableRequirements.map((f) => REQUIREMENT_LABEL[f] ?? f).join("、")}。补齐后即可显示心率区间。`
              : "尚无心率区间数据，请先补充最大心率或乳酸阈心率。"}
          </p>
        )
      ) : paceZones.length > 0 ? (
        <PaceZoneList paceZones={paceZones} thresholdPace={thresholdPace} bare />
      ) : (
        <p className="rounded-lg border border-border-subtle bg-surface-overlay/40 px-3 py-2 text-caption1 text-muted-foreground">
          尚无配速区间，请先在训练参数中填写或估算阈值配速。
        </p>
      )}

      <TextLink href="/settings?section=training" className="mt-2">调整训练区间</TextLink>
    </PageCard>
  );
}
