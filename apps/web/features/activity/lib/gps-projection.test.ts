import { describe, expect, it } from "vitest";
import { projectGpsTrack } from "./gps-projection";

describe("projectGpsTrack", () => {
  it("returns empty result when input has less than 2 points", () => {
    const empty = projectGpsTrack([], { width: 600, height: 300 });
    expect(empty.points).toHaveLength(0);
    expect(empty.start).toBeNull();
    expect(empty.finish).toBeNull();

    const single = projectGpsTrack([{ lat: 31.0, lon: 120.0 }], { width: 600, height: 300 });
    expect(single.points).toHaveLength(0);
  });

  it("centers route and preserves 1:1 aspect ratio without stretching", () => {
    // 假设中心纬度为 60 度（cos(60°) = 0.5），经度差 2 度与纬度差 1 度对应的物理距离完全相等（正方形）
    const squareTrack = [
      { lat: 59.5, lon: -1.0 },
      { lat: 59.5, lon: 1.0 },
      { lat: 60.5, lon: 1.0 },
      { lat: 60.5, lon: -1.0 },
      { lat: 59.5, lon: -1.0 },
    ];

    const result = projectGpsTrack(squareTrack, { width: 600, height: 300, pad: 20 });
    expect(result.points).toHaveLength(5);

    const xs = result.points.map((p) => p.x);
    const ys = result.points.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);

    // 投影后在屏幕上的物理宽度和物理高度保持一致（由于墨卡托单点切线与跨度舍入，误差小于 1 像素）
    expect(Math.abs(w - h)).toBeLessThanOrEqual(1.0);

    // 几何中心必须严格对齐到画布中央 (300, 150)
    const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
    expect(Math.abs(midX - 300)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(midY - 150)).toBeLessThanOrEqual(0.5);
  });

  it("correctly identifies start and finish coordinates", () => {
    const track = [
      { lat: 30.0, lon: 120.0 },
      { lat: 30.1, lon: 120.1 },
      { lat: 30.2, lon: 120.2 },
    ];
    const result = projectGpsTrack(track, { width: 400, height: 200 });
    expect(result.start).toEqual(result.points[0]);
    expect(result.finish).toEqual(result.points[2]);
  });
});
