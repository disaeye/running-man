import { describe, expect, it } from "vitest";
import { clampStreamRatio, streamGesture } from "./stream-gesture";

describe("streamGesture", () => {
  it("小幅移动保持等待，横向移动进入读取", () => {
    expect(streamGesture(4, 3, "pending")).toBe("pending");
    expect(streamGesture(12, 4, "pending")).toBe("reading");
  });

  it("纵向移动交还页面滚动，方向确定后不反转", () => {
    expect(streamGesture(3, 12, "pending")).toBe("scrolling");
    expect(streamGesture(30, 12, "scrolling")).toBe("scrolling");
    expect(streamGesture(2, 30, "reading")).toBe("reading");
  });

  it("将读取位置限制在图表范围", () => {
    expect(clampStreamRatio(-20, 10, 100)).toBe(0);
    expect(clampStreamRatio(60, 10, 100)).toBe(0.5);
    expect(clampStreamRatio(200, 10, 100)).toBe(1);
  });
});
