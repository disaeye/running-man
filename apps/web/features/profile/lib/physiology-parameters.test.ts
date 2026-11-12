import { describe, expect, it } from "vitest";
import type { ThresholdHistoryEntry } from "@features/settings/hooks/useThresholdHistory";
import type { CurrentReadings } from "@features/health/lib/physiology-display";
import { buildPhysiologyParameters } from "./physiology-parameters";

function entry(
  effective_from: string,
  values: Partial<ThresholdHistoryEntry> = {},
): ThresholdHistoryEntry {
  return {
    effective_from,
    hr_max: null,
    resting_hr: null,
    lthr: null,
    threshold_pace: null,
    source: "recorded",
    ...values,
  } as ThresholdHistoryEntry;
}

const NO_READINGS: CurrentReadings = {
  vo2max: null,
  restingHr: null,
  weight: null,
  bodyFatPct: null,
};

describe("buildPhysiologyParameters", () => {
  it("全历史的设备读数与阈值历史各自带记录日期", () => {
    const rows = buildPhysiologyParameters({
      entries: [
        entry("2026-09-07", { hr_max: 187, lthr: 172, threshold_pace: 294 }),
        entry("2026-11-04", { hr_max: 192, lthr: 185 }),
      ],
      readings: { ...NO_READINGS, vo2max: { day: "2026-06-28", value: 57 } },
    });
    expect(rows.map((row) => [row.key, row.value, row.dateLabel])).toEqual([
      ["vo2max", "57.0 ml/kg/min", "记录于 2026-06-28"],
      ["lthr", "185 bpm", "生效 2026-11-04"],
      ["threshold_pace", "4'54\"/km", "生效 2026-09-07"],
      ["hr_max", "192 bpm", "生效 2026-11-04"],
      ["resting_hr", null, null],
    ]);
  });

  it("静息心率取自生效阈值，与 /athletes/me 同源", () => {
    const rows = buildPhysiologyParameters({
      entries: [entry("2026-10-23", { resting_hr: 49, source: "manual" })],
      readings: { ...NO_READINGS, restingHr: { day: "2026-11-03", value: 47 } },
      restingHrFallback: 49,
    });
    const resting = rows.find((row) => row.key === "resting_hr");
    expect(resting?.value).toBe("49 bpm");
    expect(resting?.source).toBe("manual");
  });

  it("阈值历史缺项时使用当前生效值，不显示设备读数", () => {
    const rows = buildPhysiologyParameters({
      entries: [],
      readings: { ...NO_READINGS, weight: { day: "2026-10-31", value: 68.9 } },
      lthrFallback: 185,
      hrMaxFallback: 192,
      thresholdPaceFallback: 270,
      restingHrFallback: 49,
    });
    expect(rows.map((row) => row.value)).toEqual([
      null,
      "185 bpm",
      "4'30\"/km",
      "192 bpm",
      "49 bpm",
    ]);
  });
});
