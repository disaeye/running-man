import { largestRemainderPercent } from "@shared/lib/format";

export interface IntensitySummary {
  readonly zoneSeconds: number[];
  readonly percentages: number[];
  readonly lowPct: number;
  readonly highPct: number;
  readonly hasData: boolean;
}

export function summarizeIntensity(data: readonly { readonly zoneSeconds: readonly number[] }[]): IntensitySummary {
  const zoneSeconds = Array.from({ length: 5 }, (_, index) =>
    data.reduce((sum, point) => sum + (point.zoneSeconds[index] ?? 0), 0),
  );
  const total = zoneSeconds.reduce((sum, value) => sum + value, 0);
  const percentages = total > 0 ? largestRemainderPercent(zoneSeconds) : Array.from({ length: 5 }, () => 0);
  const lowPct = (percentages[0] ?? 0) + (percentages[1] ?? 0);
  const highPct = (percentages[3] ?? 0) + (percentages[4] ?? 0);
  return { zoneSeconds, percentages, lowPct, highPct, hasData: total > 0 };
}
