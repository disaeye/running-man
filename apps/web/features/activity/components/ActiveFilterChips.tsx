"use client";

import { X } from "lucide-react";
import { getSportConfig } from "@shared/config/sport-config";
import { INTENSITY_LABELS, type ActivityFilterState } from "./ActivityFilters";

const RACE_LABELS: Record<"race" | "training", string> = {
  race: "比赛",
  training: "常规训练",
};

interface ChipItem {
  readonly key: string;
  readonly label: string;
  readonly onRemove: () => void;
}

export function ActiveFilterChips({
  filters,
  onChange,
  onReset,
}: {
  readonly filters: ActivityFilterState;
  readonly onChange: (next: ActivityFilterState) => void;
  readonly onReset: () => void;
}) {
  const chips: ChipItem[] = [];
  if (filters.sport !== "all") {
    chips.push({
      key: "sport",
      label: getSportConfig(filters.sport).label,
      onRemove: () => onChange({ ...filters, sport: "all" }),
    });
  }
  if (filters.race && filters.race !== "all") {
    chips.push({
      key: "race",
      label: RACE_LABELS[filters.race],
      onRemove: () => onChange({ ...filters, race: "all" }),
    });
  }
  if (filters.intensity !== "all") {
    chips.push({
      key: "intensity",
      label: INTENSITY_LABELS[filters.intensity],
      onRemove: () => onChange({ ...filters, intensity: "all" }),
    });
  }
  if (filters.gpsOnly) {
    chips.push({
      key: "gps",
      label: "含 GPS",
      onRemove: () => onChange({ ...filters, gpsOnly: false }),
    });
  }
  if (filters.source !== "all") {
    chips.push({
      key: "source",
      label: `来源: ${filters.source}`,
      onRemove: () => onChange({ ...filters, source: "all" }),
    });
  }
  if (filters.q?.trim()) {
    chips.push({
      key: "q",
      label: `关键词: ${filters.q.trim()}`,
      onRemove: () => onChange({ ...filters, q: "" }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div data-testid="active-filter-chips" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={`移除筛选 ${chip.label}`}
          className="tactile focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border-default bg-surface-card px-3 text-caption1 text-text-primary hover:bg-surface-active"
        >
          <span>{chip.label}</span>
          <X className="size-3.5 text-text-muted" aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="tactile focus-ring inline-flex min-h-10 items-center rounded-full px-2.5 text-caption1 font-medium text-accent-strong hover:underline"
      >
        清空全部
      </button>
    </div>
  );
}
