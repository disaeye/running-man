import { describe, expect, it } from "vitest";
import { buildTimeline, splitByDistance } from "@features/activity/lib/splits";
import type { StreamMap } from "@shared/types/activity";

/** 匀速 3 m/s，每秒一个样本 */
function constantSpeedStream(seconds: number): StreamMap {
  const start = Date.parse("2026-11-02T10:00:00Z");
  const points = Array.from({ length: seconds }, (_, index) => ({
    sample_time: new Date(start + index * 1000).toISOString(),
    metric_type: "speed",
    value: 3,
    lat: null,
    lon: null,
    alt: null,
  }));
  return { speed: points };
}

describe("splitByDistance", () => {
  it("整公里行正好是 1000 米，尾段是剩余距离", () => {
    // 834 秒 × 3 m/s = 2502 米
    const timeline = buildTimeline(constantSpeedStream(834));
    const rows = splitByDistance(timeline, 1000);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.distanceM).toBeCloseTo(1000, 6);
    expect(rows[1]!.distanceM).toBeCloseTo(1000, 6);
    expect(rows[2]!.distanceM).toBeGreaterThan(400);
    expect(rows[2]!.distanceM).toBeLessThan(600);
  });

  it("每行配速由插值后的区间长度推算", () => {
    const timeline = buildTimeline(constantSpeedStream(834));
    const rows = splitByDistance(timeline, 1000);
    for (const row of rows.slice(0, 2)) {
      expect(row.avgSpeed).toBeCloseTo(3, 2);
      expect(row.durationS).toBeCloseTo(333.33, 1);
    }
  });

  it("不足一公里的活动只有一行", () => {
    const timeline = buildTimeline(constantSpeedStream(200));
    const rows = splitByDistance(timeline, 1000);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.distanceM).toBeCloseTo(597, 0);
  });
});
