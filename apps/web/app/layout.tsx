import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono, Noto_Sans_SC, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

/*
 * 三套字体各司其职：
 *   Space Grotesk    正文
 *   Barlow Condensed  标题与大写标签（参考稿的窄体）
 *   JetBrains Mono   指标数字
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const notoSansSc = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
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
  themeColor: "#090e12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      suppressHydrationWarning
      className={`h-full antialiased ${spaceGrotesk.variable} ${notoSansSc.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}
    >
      <head>
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
