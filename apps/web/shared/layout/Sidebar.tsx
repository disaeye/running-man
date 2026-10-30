"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, User } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { NAV_ENTRIES, activeNavFromPath } from "@shared/config/nav-config";

const STORAGE_KEY = "rm.sidebar.collapsed";
const EXPANDED_WIDTH = "w-[250px]";
const COLLAPSED_WIDTH = "w-[4.25rem]";

export interface SidebarAthleteInfo {
  weekLabel?: string;
  weeklyDistanceKm?: number | null;
  weeklyRunCount?: number | null;
}

function initialsOf(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0] ?? "";
  if (parts.length === 1) return first.charAt(0).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/**
 * The rail is the page's only colour field: lavender ground, white active pill,
 * everything else in ink. It carries the five destinations and the athlete.
 */
export function Sidebar({
  athleteName,
  athleteInfo,
}: {
  athleteName?: string;
  athleteInfo?: SidebarAthleteInfo;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the persisted width after mount
      if (stored === "1") setCollapsed(true);
      else if (stored === "0") setCollapsed(false);
      else setCollapsed(window.innerWidth < 1024);
    } catch {
      setCollapsed(window.innerWidth < 1024);
    }
    setHydrated(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // storage unavailable; the toggle still works for this session
      }
      return next;
    });
  };

  const activeId = activeNavFromPath(pathname);
  const initials = initialsOf(athleteName);

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={hydrated ? collapsed : undefined}
      className={cn(
        "hidden h-[100dvh] shrink-0 flex-col border-r border-border-subtle bg-rail transition-[width] duration-300 ease-out md:flex",
        hydrated && (collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH),
        !hydrated && EXPANDED_WIDTH,
      )}
      aria-label="主导航"
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {collapsed ? (
          <span className="grid size-7 place-items-center rounded-lg bg-primary" aria-hidden="true">
            <span className="block size-2 rounded-full bg-on-primary" />
          </span>
        ) : (
          <Link href="/" className="focus-ring flex min-w-0 items-center gap-2.5 rounded-md">
            <span className="grid size-7 place-items-center rounded-lg bg-primary" aria-hidden="true">
              <span className="block size-2 rounded-full bg-on-primary" />
            </span>
            <span className="shell-title truncate text-body font-semibold text-text-primary">
              步迹
            </span>
          </Link>
        )}
      </div>

      <nav className="flex-1 px-2.5 pt-2" aria-label="工作区">
        <ul className="space-y-0.5">
          {NAV_ENTRIES.map((item) => {
            const active = activeId === item.id;
            const Icon = item.Icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "focus-ring flex h-11 items-center rounded-lg transition-colors",
                    collapsed ? "justify-center px-2" : "gap-3 px-3",
                    active
                      ? "bg-surface-base font-medium text-accent-strong"
                      : "text-text-secondary hover:bg-surface-base/70 hover:text-text-primary",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-[18px] shrink-0"
                    strokeWidth={active ? 1.9 : 1.6}
                  />
                  {!collapsed && <span className="truncate text-subheadline">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border-subtle p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
            aria-pressed={collapsed}
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-base hover:text-text-primary"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" strokeWidth={1.7} />
            ) : (
              <PanelLeftClose className="size-4" strokeWidth={1.7} />
            )}
          </button>
        </div>
        <div className={cn("flex items-center gap-2.5", collapsed && "flex-col")}>
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-base text-caption1 font-semibold text-accent-strong"
            aria-hidden={initials ? true : undefined}
            aria-label={initials ? undefined : "运动员"}
          >
            {initials || <User className="size-4" strokeWidth={1.7} />}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-subheadline font-medium text-text-primary">
                {athleteName || "未登录"}
              </p>
              <p className="font-mono text-caption1 text-text-muted leading-tight mt-0.5">
                {athleteInfo?.weekLabel ?? "本周"}
                {athleteInfo?.weeklyDistanceKm !== null && athleteInfo?.weeklyDistanceKm !== undefined ? (
                  <>
                    <br />
                    {athleteInfo.weeklyDistanceKm.toFixed(1)} km · {athleteInfo.weeklyRunCount ?? 0} 次跑步
                  </>
                ) : null}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
