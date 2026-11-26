"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageCard } from "@shared/ui/Card";
import { Segmented } from "@shared/ui/SegmentedControl";
import { SlidingIndicator } from "@shared/ui/SlidingIndicator";
import { DateRangePicker } from "@shared/ui/DateRangePicker";
import { BrowseAllLink } from "@shared/ui/BrowseAllLink";
import { athleteRange, useAthleteTimezoneState } from "@shared/lib/training-day";
import { analysisTabUrl, resolveAnalysisPageTab, type AnalysisTabId } from "@shared/config/canonical-routes";
import { AnalysisLoadRecovery } from "./AnalysisLoadRecovery";
import { PeriodReadingPanel } from "./PeriodReadingPanel";
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

export function AnalysisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab: AnalysisTabId = resolveAnalysisPageTab(searchParams.get("tab"));
  const daysParam = Number(searchParams.get("days"));
  const validPreset = RANGES.some((preset) => preset.days === daysParam);
  const urlFrom = searchParams.get("from") ?? "";
  const urlTo = searchParams.get("to") ?? "";
  const hasUrlCustom = Boolean(urlFrom && urlTo);
  const { timezone, resolved } = useAthleteTimezoneState();
  const [presetDays, setPresetDays] = useState(validPreset ? daysParam : 84);

  const presetRange = useMemo(
    () => (resolved ? athleteRange(presetDays, timezone) : { from: "", to: "" }),
    [presetDays, timezone, resolved],
  );
  const [custom, setCustom] = useState(hasUrlCustom);
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>({ from: urlFrom, to: urlTo });
  const effectiveCustom = customRange.from && customRange.to ? customRange : presetRange;
  const activeRange = custom ? effectiveCustom : presetRange;

  function pickPreset(days: number) {
    setPresetDays(days);
    setCustom(false);
    const params = new URLSearchParams(searchParams);
    params.set("days", String(days));
    params.delete("from");
    params.delete("to");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function switchTab(next: AnalysisTabId) {
    const base = analysisTabUrl(next);
    const params = new URLSearchParams();
    if (custom && effectiveCustom.from && effectiveCustom.to) {
      params.set("from", effectiveCustom.from);
      params.set("to", effectiveCustom.to);
    } else if (presetDays !== 84 || searchParams.has("days")) {
      params.set("days", String(presetDays));
    }
    const qs = params.toString();
    if (qs) {
      const sep = base.includes("?") ? "&" : "?";
      router.replace(`${base}${sep}${qs}`, { scroll: false });
      return;
    }
    router.replace(base, { scroll: false });
  }

  function updateCustomRange(from: string, to: string) {
    setCustom(true);
    setCustomRange({ from, to });
    const params = new URLSearchParams(searchParams);
    params.delete("days");
    params.set("from", from);
    params.set("to", to);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function enableCustom() {
    if (!customRange.from || !customRange.to) {
      setCustomRange(presetRange);
    }
    setCustom(true);
  }

  return (
    <>
      <Segmented options={TABS} value={tab} onChange={switchTab} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-subtle pb-2">
        <span className="text-caption1 font-medium text-text-muted">观察周期</span>
        <div className="relative flex flex-wrap items-center gap-3">
          <SlidingIndicator
            variant="underline"
            options={custom
              ? [{ key: "custom", selected: true }]
              : RANGES.map((preset) => ({ key: String(preset.days), selected: preset.days === presetDays }))}
          />
          {RANGES.map((preset) => (
            <button
              type="button"
              key={preset.days}
              data-indicator-key={preset.days}
              onClick={() => pickPreset(preset.days)}
              aria-pressed={!custom && presetDays === preset.days}
              className={`tactile relative z-10 inline-flex min-h-11 items-center px-1 ${!custom && presetDays === preset.days ? "text-xs font-semibold text-accent-strong" : "text-xs text-muted-foreground"}`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            data-indicator-key="custom"
            onClick={enableCustom}
            aria-pressed={custom}
            className={`tactile relative z-10 inline-flex min-h-11 items-center px-1 ${custom ? "text-xs font-semibold text-accent-strong" : "text-xs text-muted-foreground"}`}
          >
            自定义
          </button>
          {custom ? (
            <DateRangePicker
              from={effectiveCustom.from}
              to={effectiveCustom.to}
              onChange={updateCustomRange}
              showQuickRanges={false}
            />
          ) : null}
        </div>
      </div>
      <div key={tab} className="view-swap space-y-4">
        <PeriodReadingPanel
          key={`${tab}:${activeRange.from}:${activeRange.to}`}
          tab={tab}
          from={activeRange.from}
          to={activeRange.to}
        />
        {tab === "load" ? (
          <AnalysisLoadRecovery from={activeRange.from} to={activeRange.to} />
        ) : tab === "performance" ? (
          <AnalysisPerformance from={activeRange.from} to={activeRange.to} />
        ) : (
          <AnalysisBodyLife from={activeRange.from} to={activeRange.to} />
        )}
      </div>
      <BrowseAllLink />
    </>
  );
}

export function AnalysisCard({ children }: { children: React.ReactNode }) {
  return <PageCard>{children}</PageCard>;
}
