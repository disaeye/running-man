"use client";

import { Badge } from "@shared/ui/Badge";
import type { HrScheme } from "@features/settings/hooks/useZoneOverrides";

/**
 * Zone scheme picker.
 *
 * The five-zone structure is fixed; a scheme only changes how the boundaries
 * are computed. Two things the UI must be honest about:
 *
 * - A scheme whose inputs are missing is shown disabled with the missing field
 *   named, rather than selectable and then silently producing no zones.
 * - Each scheme displays what its percentages are taken *of*. "Z4 = 95%" is
 *   meaningless without that, and conflating two references is exactly the bug
 *   this picker exists to prevent.
 */

export interface ZoneSchemeOption {
  key: HrScheme;
  label: string;
  reference: string;
  citation: string | null;
  available: boolean;
  missing: string[];
}

interface Props {
  current: HrScheme;
  options: ZoneSchemeOption[];
  saving: boolean;
  citation: string | null;
  onSelect: (scheme: HrScheme) => Promise<boolean>;
}

const REFERENCE_LABEL: Record<string, string> = {
  hr_max: "最大心率",
  lthr: "乳酸阈心率",
  hr_reserve: "储备心率",
};

const REQUIREMENT_LABEL: Record<string, string> = {
  hr_max: "最大心率",
  lthr: "乳酸阈心率",
  resting_hr: "静息心率",
};

export function HrSchemePicker({ current, options, saving, citation, onSelect }: Props) {
  return (
    <div data-testid="hr-scheme-picker">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const active = option.key === current;
          return (
            <button
              key={option.key}
              type="button"
              disabled={saving || !option.available}
              aria-pressed={active}
              data-testid={`hr-scheme-${option.key}`}
              onClick={() => void onSelect(option.key)}
              className={`focus-ring min-h-11 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/10"
                  : option.available
                    ? "border-border-default bg-surface-card hover:bg-surface-overlay"
                    : "cursor-not-allowed border-border-subtle bg-surface-sunken/50 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-caption1 font-semibold ${active ? "text-primary" : "text-text-primary"}`}>
                  {option.label}
                </span>
                {active && <Badge variant="info">当前</Badge>}
              </div>
              <span className="mt-1 block text-caption1 text-text-muted">
                基准：{REFERENCE_LABEL[option.reference] ?? option.reference}
              </span>
              {!option.available && (
                <span className="mt-1 block text-caption1 text-warning">
                  需要{option.missing.map((f) => REQUIREMENT_LABEL[f] ?? f).join("、")}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {citation && (
        <p className="mt-2 text-caption1 leading-relaxed text-text-muted" data-testid="hr-scheme-citation">
          出处：{citation}
        </p>
      )}
    </div>
  );
}
