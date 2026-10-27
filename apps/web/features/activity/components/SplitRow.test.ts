import { describe, expect, it } from "vitest";
import { fastestPaceIndex, splitUnit } from "@features/activity/components/SplitRow";

/**
 * 分段表与计圈表共用这两个判断：「哪一行最快」和「哪个字是单位」。
 *
 * 标记错了比不标更糟——它会指着一个慢段说「最快」——所以 null、零速和并列
 * 这三种边界都钉在这里。
 */
describe("fastestPaceIndex", () => {
  it("picks the highest average speed", () => {
    expect(fastestPaceIndex([3.1, 3.6, 3.2])).toBe(1);
  });

  it("marks a single segment", () => {
    expect(fastestPaceIndex([2.8])).toBe(0);
  });

  it("skips rows without a comparable pace", () => {
    expect(fastestPaceIndex([null, 2.9, null, 2.7])).toBe(1);
  });

  it("returns -1 when no row has a comparable pace", () => {
    expect(fastestPaceIndex([null, null])).toBe(-1);
    expect(fastestPaceIndex([])).toBe(-1);
    expect(fastestPaceIndex([0, 0])).toBe(-1);
  });

  it("keeps one marker when two rows tie", () => {
    expect(fastestPaceIndex([3.3, 3.3])).toBe(0);
  });

  // 尾部残段：11 km 的训练切完十一个整公里，剩下 158 m。那一段配速最漂亮
  // （4'08"），但它是一次除法的余数，不该抢走「最快」。
  it("skips the tail remainder when the stride is known", () => {
    expect(
      fastestPaceIndex([2.9, 3.4, 3.1, 4.2], {
        distances: [1000, 1000, 1000, 158],
        strideM: 1000,
      }),
    ).toBe(1);
  });

  // 时间分段没有声明步长，残段靠全表距离中位数认：120 m 不足中位数 290 m 的一半。
  it("falls back to the distance median when no stride is declared", () => {
    expect(fastestPaceIndex([4.2, 3.1, 3.0], { distances: [120, 300, 290] })).toBe(1);
  });

  it("compares every row when the whole table is short", () => {
    expect(
      fastestPaceIndex([4.2, 3.9], { distances: [158, 200], strideM: 1000 }),
    ).toBe(0);
  });

  it("keeps one marker when two whole rows tie and a remainder is faster", () => {
    expect(
      fastestPaceIndex([3.3, 3.3, 4.5], {
        distances: [1000, 1000, 158],
        strideM: 1000,
      }),
    ).toBe(0);
  });

  it("still skips rows without a comparable pace next to a remainder", () => {
    expect(
      fastestPaceIndex([null, 4.2, 3.0], {
        distances: [1000, 158, 1000],
        strideM: 1000,
      }),
    ).toBe(2);
  });
});

describe("splitUnit", () => {
  it("splits a value from its trailing unit", () => {
    expect(splitUnit("1.0 km")).toEqual({ value: "1.0", unit: "km" });
    expect(splitUnit("148 bpm")).toEqual({ value: "148", unit: "bpm" });
  });

  it("leaves a unit-less value intact", () => {
    expect(splitUnit("5:32")).toEqual({ value: "5:32" });
    expect(splitUnit("--")).toEqual({ value: "--" });
  });
});
