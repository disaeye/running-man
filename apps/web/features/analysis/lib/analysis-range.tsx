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
import { computeRange } from "@shared/lib/format";

export type AnalysisDateRange = { readonly from: string; readonly to: string };

export const ANALYSIS_RANGE_PRESETS = [
  { days: 30, label: "30 天" },
  { days: 90, label: "90 天" },
  { days: 365, label: "1 年" },
] as const;

export const ANALYSIS_RANGE_DEFAULT_DAYS = 90;

export function isPresetActive(
  range: AnalysisDateRange,
  days: number,
): boolean {
  const expected = computeRange(days);
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
  const [range, setRange] = useState<AnalysisDateRange>(
    defaultRange ?? computeRange(ANALYSIS_RANGE_DEFAULT_DAYS),
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
  const context = useContext(AnalysisRangeContext);
  if (context !== null) return context;
  return {
    range: computeRange(ANALYSIS_RANGE_DEFAULT_DAYS),
    setRange: () => {
      // Stable no-op fallback so consumers outside the provider still render.
    },
  };
}
