import type { ComponentType, SVGProps } from "react";
import { Sun, CalendarDays, LineChart, Flag, User } from "lucide-react";

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
 * 步迹 uses 今天、训练、分析、目标、我的 five-tab navigation.
 */
export const NAV_ENTRIES: readonly NavEntry[] = [
  { id: "today",    label: "今天", href: "/",            Icon: Sun,          mobile: "tab" },
  { id: "calendar", label: "训练", href: "/calendar",    Icon: CalendarDays, mobile: "tab" },
  { id: "analysis", label: "分析", href: "/analysis",    Icon: LineChart,    mobile: "tab" },
  { id: "goals",    label: "目标", href: "/goals",       Icon: Flag,         mobile: "tab" },
  { id: "profile",  label: "我的", href: "/profile",     Icon: User,         mobile: "tab" },
] as const;

/** Entries shown as bottom tabs on mobile (max 5; iOS "More" pattern handles overflow). */
export const MOBILE_TAB_ENTRIES: readonly NavEntry[] = NAV_ENTRIES.filter((e) => e.mobile === "tab");

/** Entries hidden from mobile tab bar, surfaced via "更多" sheet. */
export const MOBILE_MORE_ENTRIES: readonly NavEntry[] = NAV_ENTRIES.filter((e) => e.mobile === "more");

export function activeNavFromPath(pathname: string): string | null {
  if (pathname === "/") return "today";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "profile";
  const entry = NAV_ENTRIES.find(
    (e) => e.href !== "/" && (pathname === e.href || pathname.startsWith(`${e.href}/`)),
  );
  if (entry) return entry.id;
  // /activities/* maps to calendar (merged)
  if (pathname === "/activities" || pathname.startsWith("/activities/")) return "calendar";
  return null;
}

