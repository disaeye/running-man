import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono, Noto_Sans_SC, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

/*
 * 三套拉丁字体各司其职：
 *   Space Grotesk     拉丁正文与数字的后备
 *   Barlow Condensed  英文标题与大写标签（窄体）
 *   JetBrains Mono    指标数字
 * 三者都用 `display: "optional"`：字体没在首帧前就绪就整页使用度量对齐的后备字体，
 * 不会在页面打开后中途换字形；缓存命中后（第二次访问起）首帧即最终字体。
 * 中文正文的 Noto Sans SC 按 unicode-range 分成上百片，optional 会让晚到的分片永远
 * 用后备字体，同一句中文出现两种字形，所以它保留 swap。
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "optional",
});

const notoSansSc = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "optional",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "optional",
});

/**
 * Baseline metadata only.
 *
 * Route groups override this: `(public)` supplies the marketing copy and
 * `(dashboard)` keeps the app out of search results. What lives here is the
 * fallback for anything without its own — a title that is not a placeholder
 * sentence, and a platform-appropriate charset/viewport.
 */
export const metadata: Metadata = {
  title: "Running Man",
  description: "个人耐力训练系统：训练负荷、恢复状态与训练计划。",
};

/*
 * viewport-fit=cover 是全局安全区代码的开关：没有它，iOS 上所有
 * env(safe-area-inset-*) 恒为 0，底部导航与刘海补偿全部失效。
 * themeColor 镜像 --color-surface-sunken（oklch(0.16 0.012 250)），
 * meta 标签不解析 CSS 变量，只能写具体色值。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05080c",
};

const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    var mode = window.localStorage.getItem("rm.theme");
    var isDark = mode === "light"
      ? false
      : mode === "system"
        ? window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        : true;
    var root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#05080c" : "#edf0f4");
  } catch (_) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      suppressHydrationWarning
      className={`dark h-full antialiased ${spaceGrotesk.variable} ${notoSansSc.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        {process.env.NODE_ENV === "development" && (
          <Script
            src="https://unpkg.com/react-grab@0.1.48/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
