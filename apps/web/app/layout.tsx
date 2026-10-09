import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Geist via next/font carries Latin glyphs and numerals; system CJK fonts
 * (`PingFang SC`, `Microsoft YaHei`, `Noto Sans CJK SC`) fall through from
 * the `--font-sans` and `--font-mono` stacks in globals.css for Chinese glyphs — no download.
 * Targeted weight range keeps the variable font payload small.
 */
const geistSans = GeistSans;
const geistMono = GeistMono;

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
      className={`h-full antialiased ${geistSans.variable} ${geistMono.variable}`}
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
