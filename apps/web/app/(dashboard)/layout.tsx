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

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DashboardShell>{children}</DashboardShell>;
}
