import { describe, expect, it } from "vitest";
import { LOAD_TIER_CLASS, loadTier } from "@features/plan/lib/load-tier";

/**
 * 月历格的密度档位。
 *
 * 三档靠同一条 `--color-load-heatmap` 的透明度分，所以档位判断必须稳：
 * 没有训练的日子返回 null（不画条），50 / 100 TSS 是两个分界点。
 */
describe("loadTier", () => {
  it("returns null when there is no load to draw", () => {
    expect(loadTier(0)).toBeNull();
    expect(loadTier(-12)).toBeNull();
  });

  it("splits 50 and 100 TSS into low / medium / high", () => {
    expect(loadTier(49)).toBe("low");
    expect(loadTier(50)).toBe("medium");
    expect(loadTier(99)).toBe("medium");
    expect(loadTier(100)).toBe("high");
    expect(loadTier(240)).toBe("high");
  });

  it("increases opacity with the tier and never leaves the token palette", () => {
    expect(LOAD_TIER_CLASS.low).toBe("bg-load-heatmap/30");
    expect(LOAD_TIER_CLASS.medium).toBe("bg-load-heatmap/60");
    expect(LOAD_TIER_CLASS.high).toBe("bg-load-heatmap");
  });
});
