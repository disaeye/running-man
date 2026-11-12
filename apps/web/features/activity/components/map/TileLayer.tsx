"use client";

/* eslint-disable @next/next/no-img-element -- 地图瓦片是栅格图块，语义上没有替代文本，不走 next/image */
import { TILE_SIZE } from "@features/activity/lib/gps-mercator";

interface TileLayerProps {
  /** 请求瓦片用的整数缩放级别 */
  zoom: number;
  /** 相对整数级别的放大系数，让底图贴合连续缩放 */
  scale: number;
  /** 视图左上角对应的世界像素坐标（连续缩放级别下） */
  originX: number;
  originY: number;
  width: number;
  height: number;
  onTileError: () => void;
}

interface TileView {
  key: string;
  src: string;
  left: number;
  top: number;
}

/** 平铺当前视口覆盖的瓦片，经度方向环绕取模；显示尺寸按 scale 放大。 */
export function TileLayer({ zoom, scale, originX, originY, width, height, onTileError }: TileLayerProps) {
  const tiles = buildTiles(zoom, scale, originX, originY, width, height);
  return (
    <>
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.src}
          width={Math.ceil(TILE_SIZE * scale)}
          height={Math.ceil(TILE_SIZE * scale)}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={onTileError}
          className="pointer-events-none absolute select-none"
          style={{ left: tile.left, top: tile.top }}
        />
      ))}
    </>
  );
}

function buildTiles(zoom: number, scale: number, originX: number, originY: number, width: number, height: number): TileView[] {
  const n = 2 ** zoom;
  // 世界像素原点从连续缩放级别换算回瓦片所在的整数级别。
  const originTileX = originX / scale;
  const originTileY = originY / scale;
  const viewTileW = width / scale;
  const viewTileH = height / scale;
  const x0 = Math.floor(originTileX / TILE_SIZE);
  const x1 = Math.floor((originTileX + viewTileW) / TILE_SIZE);
  const y0 = Math.floor(originTileY / TILE_SIZE);
  const y1 = Math.floor((originTileY + viewTileH) / TILE_SIZE);
  const tiles: TileView[] = [];
  for (let ty = y0; ty <= y1; ty += 1) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = x0; tx <= x1; tx += 1) {
      const wrappedX = ((tx % n) + n) % n;
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        src: `/tiles/${zoom}/${wrappedX}/${ty}.png`,
        left: (tx * TILE_SIZE - originTileX) * scale,
        top: (ty * TILE_SIZE - originTileY) * scale,
      });
    }
  }
  return tiles;
}
