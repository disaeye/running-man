import { describe, expect, it } from "vitest";
import { toMuscleVolumeAndDistribution } from "@features/strength/lib/strength-analytics";

describe("strength analytics distribution", () => {
  it("calculates each category's share of returned volume", () => {
    const { distribution } = toMuscleVolumeAndDistribution([], [
      { category: "腿", set_count: 8, volume_kg: 1500 },
      { category: "背", set_count: 4, volume_kg: 500 },
    ]);
    expect(distribution.find((row) => row.category === "腿")?.percentage).toBe(75);
    expect(distribution.find((row) => row.category === "背")?.percentage).toBe(25);
  });

});
