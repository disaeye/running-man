// Analysis date-range contract — page-level in-memory range shared by every
// mounted analysis tab. Resets on remount; never read from or written to URL,
// localStorage, or any global state. Default is the approved 90-day window.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";

export type AnalysisDateRange = { readonly from: string; readonly to: string };

export const ANALYSIS_RANGE_PRESETS = [
  { days: 30, label: "30 天" },
  { days: 90, label: "90 天" },
  { days: 365, label: "1 年" },
] as const;

export const ANALYSIS_RANGE_DEFAULT_DAYS = 90;

/**
 * Whether `range` is still the current `days`-wide window on the athlete's clock.
 *
 * "Current" has to be recomputed against the athlete's today, not a fixed value
 * captured at mount: a session left open past midnight (or a laptop that
 * changes zone) otherwise keeps reporting the stale preset as active.
 */
export function isPresetActive(
  range: AnalysisDateRange,
  days: number,
  timezone: string,
): boolean {
  const expected = athleteRange(days, timezone);
  return range.from === expected.from && range.to === expected.to;
}

interface AnalysisRangeContextValue {
  readonly range: AnalysisDateRange;
  readonly setRange: (next: AnalysisDateRange) => void;
}

const AnalysisRangeContext = createContext<AnalysisRangeContextValue | null>(
  null,
);

export function AnalysisRangeProvider({
  children,
  defaultRange,
}: {
  readonly children: ReactNode;
  readonly defaultRange?: AnalysisDateRange;
}) {
  const timezone = useAthleteTimezone();
  // The window is anchored to the athlete's today. Recomputing it from the
  // profile matters because the profile resolves asynchronously: anchoring on a
  // render-time default would otherwise lock the page to UTC for its lifetime
  // on a first load with a non-UTC athlete.
  const [range, setRange] = useState<AnalysisDateRange>(
    defaultRange ?? athleteRange(ANALYSIS_RANGE_DEFAULT_DAYS, timezone),
  );
  const value = useMemo(
    () => ({ range, setRange }),
    [range],
  );
  return (
    <AnalysisRangeContext.Provider value={value}>
      {children}
    </AnalysisRangeContext.Provider>
  );
}

export function useAnalysisRange(): AnalysisRangeContextValue {
  // Before the early return: a hook called after it would run only for the
  // consumers that render outside the provider, which is the order eslint's
  // rules-of-hooks exists to forbid.
  const timezone = useAthleteTimezone();
  const context = useContext(AnalysisRangeContext);
  if (context !== null) return context;
  // No provider: fall back to the athlete's window so a tab rendered outside
  // the page still requests the same range its siblings do.
  return {
    range: athleteRange(ANALYSIS_RANGE_DEFAULT_DAYS, timezone),
    setRange: () => {
      // Stable no-op fallback so consumers outside the provider still render.
    },
  };
}
