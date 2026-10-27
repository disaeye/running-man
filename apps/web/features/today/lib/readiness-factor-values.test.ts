import { describe, expect, it } from "vitest";
import {
  readinessFactorValues,
  type FactorReading,
} from "@features/today/lib/readiness-factor-values";

/**
 * 这几条钉子钉的是「读数不编数」：缺输入时 value 为 null 而不是 0，
 * 基准不足时 note 为 null 而不是「持平」，差值按分钟/整数各自四舍五入。
 *
 * 网格位置固定五个，顺序也固定——格子在两列布局里对应哪一列取决于顺序，
 * 所以顺序一起测。
 */

const HOUR = 3600;
const MINUTE = 60;

function sleepDay(day: string, sleepSecs: number | null) {
  return { day, sleep_secs: sleepSecs, resting_hr: null, hrv: null };
}

function vitalDay(day: string, restingHr: number | null, hrv: number | null) {
  return { day, sleep_secs: null, resting_hr: restingHr, hrv };
}

function pmcSeries(atl: readonly number[], tsb: readonly number[]) {
  return atl.map((value, index) => ({
    day: `2026-01-${String(index + 1).padStart(2, "0")}`,
    atl: value,
    tsb: tsb[index] ?? 0,
  }));
}

function readingOf(readings: readonly FactorReading[], key: FactorReading["key"]): FactorReading {
  const found = readings.find((reading) => reading.key === key);
  if (!found) throw new Error(`missing factor ${key}`);
  return found;
}

describe("readinessFactorValues", () => {
  it("always returns the five factors in display order", () => {
    const readings = readinessFactorValues({ wellness: [], pmc: [] });

    expect(readings.map((reading) => reading.key)).toEqual([
      "sleep",
      "resting_hr",
      "hrv",
      "tsb",
      "atl_velocity",
    ]);
  });

  it("reports a missing input as null instead of zero", () => {
    const readings = readinessFactorValues({ wellness: [], pmc: [] });

    for (const reading of readings) {
      expect(reading.value).toBeNull();
      expect(reading.note).toBeNull();
    }
  });

  it("shows sleep as h/m with the minutes padded, compared in whole minutes", () => {
    const wellness = [
      sleepDay("2026-01-01", 7 * HOUR + 20 * MINUTE),
      sleepDay("2026-01-02", 7 * HOUR + 20 * MINUTE),
      sleepDay("2026-01-03", 7 * HOUR + 42 * MINUTE),
    ];

    const sleep = readingOf(readinessFactorValues({ wellness, pmc: [] }), "sleep");

    expect(sleep.value).toBe("7h42m");
    expect(sleep.unit).toBeNull();
    expect(sleep.note).toBe("高于 7 日均值 22 分钟");
  });

  it("says 持平 only when the difference rounds to zero", () => {
    const wellness = [
      sleepDay("2026-01-01", 8 * HOUR),
      sleepDay("2026-01-02", 8 * HOUR + 10),
    ];

    expect(readingOf(readinessFactorValues({ wellness, pmc: [] }), "sleep").note).toBe(
      "与 7 日均值持平",
    );
  });

  it("keeps the reading but drops the comparison when the baseline is a single point", () => {
    const wellness = [sleepDay("2026-01-01", 6 * HOUR + 5 * MINUTE)];

    const sleep = readingOf(readinessFactorValues({ wellness, pmc: [] }), "sleep");

    expect(sleep.value).toBe("6h05m");
    expect(sleep.note).toBeNull();
  });

  it("reads resting heart rate in whole bpm against the 7-day mean", () => {
    const wellness = [
      vitalDay("2026-01-01", 50, null),
      vitalDay("2026-01-02", 52, null),
      vitalDay("2026-01-03", 48, null),
    ];

    const resting = readingOf(readinessFactorValues({ wellness, pmc: [] }), "resting_hr");

    expect(resting.value).toBe("48");
    expect(resting.unit).toBe("bpm");
    expect(resting.note).toBe("低于 7 日均值 3");
  });

  it("reads HRV in ms", () => {
    const wellness = [
      vitalDay("2026-01-01", null, 58),
      vitalDay("2026-01-02", null, 54),
      vitalDay("2026-01-03", null, 62),
    ];

    const hrv = readingOf(readinessFactorValues({ wellness, pmc: [] }), "hrv");

    expect(hrv.value).toBe("62");
    expect(hrv.unit).toBe("ms");
    expect(hrv.note).toBe("高于 7 日均值 6");
  });

  it("compares TSB with seven days ago, one decimal, signed", () => {
    const pmc = pmcSeries([40, 41, 42, 43, 44, 45, 46, 47], [10, 9, 8, 7, 6, 5, 4, 3]);

    const tsb = readingOf(readinessFactorValues({ wellness: [], pmc }), "tsb");

    expect(tsb.value).toBe("3.0");
    expect(tsb.unit).toBeNull();
    expect(tsb.note).toBe("较 7 日前 -7.0");
  });

  it("has no TSB comparison before eight points exist", () => {
    const pmc = pmcSeries([40, 41], [1, 2]);

    const tsb = readingOf(readinessFactorValues({ wellness: [], pmc }), "tsb");

    expect(tsb.value).toBe("2.0");
    expect(tsb.note).toBeNull();
  });

  it("classifies ATL movement by the 7-day delta", () => {
    const rising = pmcSeries([40, 40, 40, 40, 40, 40, 40, 50], [0, 0, 0, 0, 0, 0, 0, 0]);
    const falling = pmcSeries([40, 40, 40, 40, 40, 40, 40, 35], [0, 0, 0, 0, 0, 0, 0, 0]);
    const flat = pmcSeries([40, 40, 40, 40, 40, 40, 40, 39], [0, 0, 0, 0, 0, 0, 0, 0]);

    expect(readingOf(readinessFactorValues({ wellness: [], pmc: rising }), "atl_velocity")).toEqual({
      key: "atl_velocity",
      label: "疲劳 ATL",
      value: "+10.0",
      unit: null,
      note: "上升较快",
    });
    expect(readingOf(readinessFactorValues({ wellness: [], pmc: falling }), "atl_velocity").note).toBe(
      "正在回落",
    );
    expect(readingOf(readinessFactorValues({ wellness: [], pmc: flat }), "atl_velocity").note).toBe(
      "基本平稳",
    );
  });
});
