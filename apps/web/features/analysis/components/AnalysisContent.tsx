"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageCard, Segmented } from "@shared/ui/Lovable";
import { SlidingIndicator } from "@shared/ui/SlidingIndicator";
import { DateRangePicker } from "@shared/ui/DateRangePicker";
import { BrowseAllLink } from "@shared/ui/BrowseAllLink";
import { athleteRange, useAthleteTimezoneState } from "@shared/lib/training-day";
import { analysisTabUrl, resolveAnalysisPageTab, type AnalysisTabId } from "@shared/config/canonical-routes";
import { AnalysisLoadRecovery } from "./AnalysisLoadRecovery";
import { AnalysisPerformance } from "./AnalysisPerformance";
import { AnalysisBodyLife } from "./AnalysisBodyLife";

const RANGES = [
  { days: 28, label: "4周" },
  { days: 84, label: "12周" },
  { days: 180, label: "半年" },
] as const;

const TABS: readonly { value: AnalysisTabId; label: string }[] = [
  { value: "load", label: "负荷与恢复" },
  { value: "performance", label: "能力与表现" },
  { value: "body", label: "身体与生活" },
];

/** `?tab=` 决定当前视图，链接可分享、浏览器后退可用。 */
export function AnalysisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab: AnalysisTabId = resolveAnalysisPageTab(searchParams.get("tab"));
  const { timezone, resolved } = useAthleteTimezoneState();
  const [presetDays, setPresetDays] = useState(84);
  // 时区未定前不请求：UTC 一轮、真实时区再一轮只会让首屏多等一整轮。
  const presetRange = useMemo(
    () => (resolved ? athleteRange(presetDays, timezone) : { from: "", to: "" }),
    [presetDays, timezone, resolved],
  );
  const [custom, setCustom] = useState(false);
  const [range, setRange] = useState(presetRange);
  const activeRange = custom ? range : presetRange;

  function pickPreset(days: number) {
    setPresetDays(days);
    setCustom(false);
  }

  return <>
    <Segmented options={TABS} value={tab} onChange={(next) => router.replace(analysisTabUrl(next))} />
    <div className="relative flex flex-wrap items-center gap-3">
      <SlidingIndicator
        variant="underline"
        options={custom
          ? [{ key: "custom", selected: true }]
          : RANGES.map((preset) => ({ key: String(preset.days), selected: preset.days === presetDays }))}
      />
      {RANGES.map((preset) => <button type="button" key={preset.days} data-indicator-key={preset.days} onClick={() => pickPreset(preset.days)} aria-pressed={!custom && presetDays === preset.days} className={`tactile relative z-10 inline-flex min-h-11 items-center px-1 ${!custom && presetDays === preset.days ? "text-xs font-semibold text-accent-strong" : "text-xs text-muted-foreground"}`}>{preset.label}</button>)}
      <button type="button" data-indicator-key="custom" onClick={() => setCustom(true)} aria-pressed={custom} className={`tactile relative z-10 inline-flex min-h-11 items-center px-1 ${custom ? "text-xs font-semibold text-accent-strong" : "text-xs text-muted-foreground"}`}>自定义</button>
      {custom ? <DateRangePicker from={range.from} to={range.to} onChange={(from, to) => { setCustom(true); setRange({ from, to }); }} showQuickRanges={false} /> : null}
    </div>
    <div key={tab} className="view-swap">
      {tab === "load" ? <AnalysisLoadRecovery from={activeRange.from} to={activeRange.to} /> : tab === "performance" ? <AnalysisPerformance from={activeRange.from} to={activeRange.to} /> : <AnalysisBodyLife from={activeRange.from} to={activeRange.to} />}
    </div>
    <BrowseAllLink />
  </>;
}

export function AnalysisCard({ children }: { children: React.ReactNode }) {
  return <PageCard>{children}</PageCard>;
}
