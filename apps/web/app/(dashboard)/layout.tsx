import type { Metadata } from "next";
import { DashboardShell } from "./dashboard-shell";

/**
 * The dashboard is private: every route here requires a session.
 *
 * `robots: noindex` keeps crawlers out — without it a search engine can index
 * pages that only redirect to a login form, which is both useless in results
 * and needlessly public about the app's route structure.
 *
 * This file is a server component so it can export metadata; the client-side
 * shell (SWR provider, navigation, avatar handler) lives in `dashboard-shell`.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Render every dashboard route per request.
 *
 * These pages are client components that read the clock while rendering (the
 * training week range, "today" keys, relative dates). Prerendering them at
 * build time bakes the build date into the HTML, so a page built on Sunday
 * still claims that week until it hydrates — and React reports a hydration
 * mismatch (text content differs) while the corrected value replaces it.
 * Nothing here benefits from static output: the routes sit behind a session
 * cookie and every one of them renders live data.
 */
export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DashboardShell>{children}</DashboardShell>;
}
