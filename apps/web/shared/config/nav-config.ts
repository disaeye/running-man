import type { ComponentType, SVGProps } from "react";
import { LayoutDashboard, Calendar, BarChart3, Target, User } from "lucide-react";

export interface NavEntry {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * Mobile visibility:
   * - "tab"     → visible in bottom tab bar
   * - "more"    → hidden from tab bar, surfaces in "More" sheet (iOS pattern for 6+ destinations)
   */
  readonly mobile: "tab" | "more";
}

/**
 * Primary navigation — single source of truth for both PC sidebar and mobile tab bar.
 */
export const NAV_ENTRIES: readonly NavEntry[] = [
  { id: "today",    label: "首页", href: "/",            Icon: LayoutDashboard, mobile: "tab" },
  { id: "calendar", label: "日历", href: "/calendar",    Icon: Calendar,        mobile: "tab" },
  { id: "analysis", label: "分析", href: "/analysis",    Icon: BarChart3,       mobile: "tab" },
  { id: "goals",    label: "目标", href: "/goals",       Icon: Target,          mobile: "tab" },
  { id: "settings", label: "档案", href: "/settings",    Icon: User,            mobile: "tab" },
] as const;

/** Entries shown as bottom tabs on mobile (max 5; iOS "More" pattern handles overflow). */
export const MOBILE_TAB_ENTRIES: readonly NavEntry[] = NAV_ENTRIES.filter((e) => e.mobile === "tab");

/** Entries hidden from mobile tab bar, surfaced via "更多" sheet. */
export const MOBILE_MORE_ENTRIES: readonly NavEntry[] = NAV_ENTRIES.filter((e) => e.mobile === "more");

export function activeNavFromPath(pathname: string): string | null {
  if (pathname === "/") return "today";
  const entry = NAV_ENTRIES.find(
    (e) => e.href !== "/" && (pathname === e.href || pathname.startsWith(`${e.href}/`)),
  );
  if (entry) return entry.id;
  // /activities/* maps to calendar (merged)
  if (pathname === "/activities" || pathname.startsWith("/activities/")) return "calendar";
  return null;
}

