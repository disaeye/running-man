import { describe, expect, it } from "vitest";
import { toMuscleVolumeAndDistribution } from "@features/strength/lib/strength-analytics";

describe("strength analytics response mapping", () => {
  it("maps muscle volume fields available in the volume response", () => {
    expect(toMuscleVolumeAndDistribution(
      [
        { muscle_group: "腿", volume_kg: 1280 },
        { muscle_group: "背", volume_kg: 640 },
      ],
      [],
    ).muscleVolume).toEqual([
      { muscle: "腿", volume_kg: 1280 },
      { muscle: "背", volume_kg: 640 },
    ]);
  });

  it("computes each muscle-group share from the total returned volume", () => {
    const { distribution } = toMuscleVolumeAndDistribution([], [
      { category: "腿", set_count: 8, volume_kg: 1280 },
      { category: "背", set_count: 4, volume_kg: 640 },
    ]);
    expect(distribution).toHaveLength(2);
    expect(distribution.find((row) => row.category === "腿")?.percentage).toBeCloseTo(66.67, 2);
    expect(distribution.find((row) => row.category === "背")?.percentage).toBeCloseTo(33.33, 2);
  });

  it("keeps percentages at zero when the total volume is zero", () => {
    const { distribution } = toMuscleVolumeAndDistribution([], [
      { category: "腿", set_count: 0, volume_kg: 0 },
    ]);
    expect(distribution).toEqual([
      { category: "腿", set_count: 0, percentage: 0, volume_kg: 0 },
    ]);
  });
});
