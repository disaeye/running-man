import { describe, expect, it } from "vitest";
import { formatClock } from "@shared/lib/format";

/**
 * 共享的时钟式显示：一小时以内 `m:ss`，一小时以上 `h:mm:ss`。
 * 成绩列表与目标卡共用这一种写法，所以这里钉住边界值。
 */

describe("formatClock", () => {
  it("writes hours when the time has them", () => {
    expect(formatClock(5440)).toBe("1:30:40");
    expect(formatClock(3600)).toBe("1:00:00");
  });

  it("writes minute and second only under an hour", () => {
    expect(formatClock(1122)).toBe("18:42");
    expect(formatClock(90)).toBe("1:30");
    expect(formatClock(30)).toBe("0:30");
  });

  it("clamps negative input to zero", () => {
    expect(formatClock(-5)).toBe("0:00");
  });
});
