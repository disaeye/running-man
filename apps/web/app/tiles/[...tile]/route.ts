// CARTO dark_matter 瓦片同源代理：浏览器只请求本域，瓦片可被 CDN 长缓存。
// 密钥只存在于服务端环境变量里，请求瓦片的浏览器拿不到它。
const UPSTREAM = "https://basemaps.cartocdn.com/dark_all";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ tile: string[] }> },
): Promise<Response> {
  const key = process.env.MAP_TILE_KEY;
  if (!key) throw new Error("MAP_TILE_KEY is not configured");

  const { tile } = await context.params;
  const [z, x, yFile] = tile ?? [];
  const y = yFile?.replace(/\.png$/, "");
  const zoom = Number(z);
  const tileX = Number(x);
  const tileY = Number(y);
  const maxTile = 2 ** zoom;
  if (
    !Number.isInteger(zoom) ||
    !Number.isInteger(tileX) ||
    !Number.isInteger(tileY) ||
    zoom < 0 ||
    zoom > 20 ||
    tileX < 0 ||
    tileY < 0 ||
    tileX >= maxTile ||
    tileY >= maxTile
  ) {
    return new Response("invalid tile coordinate", { status: 400 });
  }

  const upstream = await fetch(`${UPSTREAM}/${zoom}/${tileX}/${tileY}.png?key=${key}`, {
    headers: { "user-agent": "running-man-tile-proxy/1.0" },
    next: { revalidate: 604800 },
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("tile upstream error", { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
