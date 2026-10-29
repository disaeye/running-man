import type { Metadata } from "next";
import { Barlow_Condensed, JetBrains_Mono, Space_Grotesk } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      suppressHydrationWarning
      className={`h-full antialiased ${spaceGrotesk.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}
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
