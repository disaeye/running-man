import { describe, expect, it } from "vitest";
import {
  fitZoom,
  geoBounds,
  lonLatToWorldPixel,
  tileZoomScale,
} from "@features/activity/lib/gps-mercator";

describe("lonLatToWorldPixel", () => {
  it("将 (0,0) 映射到 0 级瓦片中心", () => {
    const p = lonLatToWorldPixel(0, 0, 0);
    expect(p.x).toBeCloseTo(128);
    expect(p.y).toBeCloseTo(128);
  });

  it("同一缩放级别下相邻经度保持等距", () => {
    const a = lonLatToWorldPixel(118, 31, 14);
    const b = lonLatToWorldPixel(118.001, 31, 14);
    const c = lonLatToWorldPixel(118.002, 31, 14);
    expect(b.x - a.x).toBeCloseTo(c.x - b.x, 6);
  });

  it("对超出墨卡托范围的纬度做收敛", () => {
    const top = lonLatToWorldPixel(0, 89, 12);
    const clamped = lonLatToWorldPixel(0, 85.05112878, 12);
    expect(top.y).toBeCloseTo(clamped.y, 4);
    expect(top.y).toBeGreaterThanOrEqual(-0.001);
    expect(top.y).toBeLessThanOrEqual(1);
  });
});

describe("fitZoom", () => {
  const smallRun = {
    minLat: 31.866,
    maxLat: 31.871,
    minLon: 118.824,
    maxLon: 118.838,
  };

  it("为小范围路线给出高缩放级别且放得下", () => {
    const zoom = fitZoom(smallRun, 800, 380, 40);
    expect(zoom).toBeGreaterThanOrEqual(13);
    expect(zoom).toBeLessThanOrEqual(17);
    const tl = lonLatToWorldPixel(smallRun.minLon, smallRun.maxLat, zoom);
    const br = lonLatToWorldPixel(smallRun.maxLon, smallRun.minLat, zoom);
    expect(br.x - tl.x).toBeLessThanOrEqual(800 - 80);
    expect(br.y - tl.y).toBeLessThanOrEqual(380 - 80);
  });

  it("大范围路线返回较低缩放级别", () => {
    const wide = { minLat: 30, maxLat: 34, minLon: 116, maxLon: 122 };
    const zoom = fitZoom(wide, 800, 380, 40);
    expect(zoom).toBeLessThan(fitZoom(smallRun, 800, 380, 40));
  });

  it("连续缩放让轨迹填满可用宽度或高度", () => {
    const zoom = fitZoom(smallRun, 800, 380, 40);
    const tl = lonLatToWorldPixel(smallRun.minLon, smallRun.maxLat, zoom);
    const br = lonLatToWorldPixel(smallRun.maxLon, smallRun.minLat, zoom);
    const spanX = br.x - tl.x;
    const spanY = br.y - tl.y;
    // 至少一个方向贴近可用空间，避免整数级别造成的留白。
    expect(Math.max(spanX / 720, spanY / 300)).toBeGreaterThan(0.95);
  });
});

describe("tileZoomScale", () => {
  it("小数级别向下取整请求瓦片，并给出放大系数", () => {
    const { tileZoom, scale } = tileZoomScale(13.5);
    expect(tileZoom).toBe(13);
    expect(scale).toBeCloseTo(Math.SQRT2, 6);
  });

  it("整数级别的放大系数为 1", () => {
    expect(tileZoomScale(14)).toEqual({ tileZoom: 14, scale: 1 });
  });
});

describe("geoBounds", () => {
  it("计算点集范围，空点集返回 null", () => {
    const bounds = geoBounds([
      { lat: 1, lon: 2 },
      { lat: -3, lon: 0.5 },
    ]);
    expect(bounds).toEqual({ minLat: -3, maxLat: 1, minLon: 0.5, maxLon: 2 });
    expect(geoBounds([])).toBeNull();
  });
});
