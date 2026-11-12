export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
}

export interface GpsProjectionResult {
  readonly points: readonly ProjectedPoint[];
  readonly start: ProjectedPoint | null;
  readonly finish: ProjectedPoint | null;
}

export interface ProjectGpsOptions {
  readonly width: number;
  readonly height: number;
  readonly pad?: number;
}

/**
 * 等比例等角墨卡托投影算法。
 * 纠正经纬度因纬度引起的物理拉伸变形，严格保持 1:1 几何长宽比，
 * 并将路线自动在指定视口尺寸内居中。
 */
export function projectGpsTrack(
  points: readonly { readonly lat: number; readonly lon: number }[],
  options: ProjectGpsOptions,
): GpsProjectionResult {
  if (points.length < 2) {
    return {
      points: [],
      start: null,
      finish: null,
    };
  }

  const pad = options.pad ?? 24;
  const width = options.width;
  const height = options.height;

  // 1. 计算平均参考纬度的弧度，并获得经度方向的球面物理比例系数 cos(meanLat)
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const cosMeanLat = Math.cos((meanLat * Math.PI) / 180);

  // 2. 将球面坐标投影为平面等比例坐标
  const planar = points.map((p) => ({
    x: p.lon * cosMeanLat,
    y: p.lat,
  }));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of planar) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const spanX = maxX - minX || 0.00001;
  const spanY = maxY - minY || 0.00001;

  // 3. 计算统一缩放因子，保持横纵比例绝对一致
  const availW = Math.max(10, width - pad * 2);
  const availH = Math.max(10, height - pad * 2);
  const scale = Math.min(availW / spanX, availH / spanY);

  // 4. 将轨迹几何中心平移对齐到视口正中央
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const cx = width / 2;
  const cy = height / 2;

  const projected: ProjectedPoint[] = planar.map((p) => ({
    x: Number((cx + (p.x - midX) * scale).toFixed(1)),
    // 北向纬度增加，SVG 坐标 y 轴朝下，取负号翻转
    y: Number((cy - (p.y - midY) * scale).toFixed(1)),
  }));

  return {
    points: projected,
    start: projected[0] ?? null,
    finish: projected[projected.length - 1] ?? null,
  };
}
