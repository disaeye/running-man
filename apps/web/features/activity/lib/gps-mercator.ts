// Web Mercator (EPSG:3857) 瓦片坐标计算，参考 slippy map tilenames 规范

export const TILE_SIZE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 17;
const MAX_LAT = 85.05112878;

export interface WorldPixel {
  readonly x: number;
  readonly y: number;
}

export interface GeoBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLon: number;
  readonly maxLon: number;
}

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export function lonLatToWorldPixel(lon: number, lat: number, zoom: number): WorldPixel {
  const clampedLat = Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export function geoBounds(points: readonly GeoPoint[]): GeoBounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** 找到能将整个范围放进视图（扣除内边距）的缩放级别，支持小数级别以填满可用空间。 */
export function fitZoom(bounds: GeoBounds, viewW: number, viewH: number, pad: number): number {
  const availW = Math.max(1, viewW - pad * 2);
  const availH = Math.max(1, viewH - pad * 2);
  // 以 zoom=0 的世界像素跨度为基准，反解使轨迹恰好贴合可用区域的缩放级别。
  const tl0 = lonLatToWorldPixel(bounds.minLon, bounds.maxLat, 0);
  const br0 = lonLatToWorldPixel(bounds.maxLon, bounds.minLat, 0);
  const spanX = Math.max(1e-6, br0.x - tl0.x);
  const spanY = Math.max(1e-6, br0.y - tl0.y);
  const zoom = Math.log2(Math.min(availW / spanX, availH / spanY));
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** 瓦片只提供整数缩放级别：向下取整请求瓦片，再按比例放大到连续缩放级别。 */
export function tileZoomScale(zoom: number): { tileZoom: number; scale: number } {
  const tileZoom = Math.max(MIN_ZOOM, Math.floor(zoom));
  return { tileZoom, scale: 2 ** (zoom - tileZoom) };
}
