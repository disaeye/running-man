import type { MetadataRoute } from "next";

/**
 * PWA manifest：装进主屏后以 standalone 独立窗口运行，无地址栏。
 * 颜色镜像 globals.css 的 token 值（manifest 不解析 CSS 变量）：
 *   background_color ← --color-surface-sunken（oklch(0.16 0.012 250) ≈ #090e12）
 *   theme_color      ← 同上，与 app/layout.tsx 的 viewport themeColor 一致
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Running Man",
    short_name: "Running Man",
    description: "个人耐力训练系统：训练负荷、恢复状态与训练计划。",
    start_url: "/",
    display: "standalone",
    background_color: "#090e12",
    theme_color: "#090e12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
