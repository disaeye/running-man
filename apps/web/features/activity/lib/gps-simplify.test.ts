import { describe, expect, it } from "vitest";
import { cumulativeDistancesKm, simplifyTrack } from "@features/activity/lib/gps-simplify";
import type { GpsTrackPoint } from "@features/activity/lib/gps-track";

function point(i: number): GpsTrackPoint {
  return { lat: 31 + i * 0.00001, lon: 118 + i * 0.00001, sample_time: `2026-09-22T02:00:${String(i % 60).padStart(2, "0")}Z` };
}

describe("simplifyTrack", () => {
  it("对超长轨迹做抽稀并控制点数上限", () => {
    const input = Array.from({ length: 5000 }, (_, i) => point(i));
    const out = simplifyTrack(input);
    expect(out.length).toBeLessThanOrEqual(1300);
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it("保留首尾点，中间点使用原始采样时间", () => {
    const input = Array.from({ length: 40 }, (_, i) => point(i));
    const out = simplifyTrack(input);
    expect(out[0]).toEqual(input[0]);
    expect(out[out.length - 1]).toEqual(input[input.length - 1]);
    const times = new Set(input.map((p) => p.sample_time));
    for (const p of out) {
      expect(times.has(p.sample_time)).toBe(true);
    }
  });
});

describe("cumulativeDistancesKm", () => {
  it("累计距离单调递增，首点为 0", () => {
    const input = Array.from({ length: 10 }, (_, i) => point(i));
    const dists = cumulativeDistancesKm(input);
    expect(dists[0]!).toBe(0);
    for (let i = 1; i < dists.length; i += 1) {
      expect(dists[i]!).toBeGreaterThan(dists[i - 1]!);
    }
    // 每步约 1.45m，10 点累计约 13m
    expect(dists[9]!).toBeGreaterThan(0.01);
    expect(dists[9]!).toBeLessThan(0.02);
  });
});
