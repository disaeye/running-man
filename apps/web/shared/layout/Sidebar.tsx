"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { NAV_ENTRIES, activeNavFromPath } from "@shared/config/nav-config";

import { ThemeToggle } from "@shared/ui/ThemeToggle";
const STORAGE_KEY = "rm.sidebar.collapsed";
const EXPANDED_WIDTH = "w-60";   // 240px
const COLLAPSED_WIDTH = "w-16";  // 64px

/**
 * Editorial sidebar with pill navigation.
 *
 * - Active item = filled pill background (bg-accent/15) + accent color text/icon.
 * - Clean typography: 17px label, 24px icon.
 * - Hover state is subtle bg shift, not color change.
 * - Collapse behavior preserved (localStorage).
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") {
    // eslint-disable-next-line react-hooks/set-state-in-effect
        setCollapsed(true);
      } else if (stored === "0") {
        setCollapsed(false);
      } else {
        setCollapsed(window.innerWidth < 1024);
      }
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
        // ignore
      }
      return next;
    });
  };

  const activeId = activeNavFromPath(pathname);

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={hydrated ? collapsed : undefined}
      className={cn(
        "glass-surface sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-r border-border-subtle transition-[width] duration-300 ease-out md:flex",
        hydrated && (collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH),
        !hydrated && EXPANDED_WIDTH,
      )}
      aria-label="主导航"
    >
      {/* `px-4` rather than `px-5`: the wordmark measured 121px against 118px
          available in the 240px rail, so "Running Man" was silently truncated to
          "Running …" at every width. The extra 8px is what it needed; nothing
          else in the rail was tight. */}
      <div className={cn("flex shrink-0 items-center border-b border-border-subtle", collapsed ? "h-20 justify-center px-2" : "h-20 justify-between px-4")}>
        {!collapsed && (
          <Link href="/" className="group min-w-0 rounded-md focus-ring" aria-label="Running Man，返回首页">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-[9px] bg-primary text-on-primary shadow-[0_0_20px_rgba(90,111,154,.25)]" aria-hidden="true">
                <span className="block size-2 rounded-full bg-on-primary" />
              </span>
              {/* Deliberately not a scale token. This is a wordmark sitting in
                  a 240px rail next to a 28px icon and a collapse button; at
                  `title3` (20px) it truncates to "Running …". Brand type is
                  sized to its container, not to the reading scale. */}
              {/* type-scale-allow */}
              <span className="shell-title truncate text-[17px] font-semibold text-text-primary">Running Man</span>
            </div>
            <p className="mt-1 pl-9 font-mono text-caption2 uppercase tracking-[0.2em] text-text-muted">endurance / OS</p>
          </Link>
        )}
        {collapsed && <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-on-primary shadow-[0_0_20px_rgba(90,111,154,.25)]" aria-hidden="true"><span className="size-2 rounded-full bg-on-primary" /></span>}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          aria-pressed={collapsed}
          className="focus-ring flex size-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          {collapsed ? <ChevronRight className="size-[17px]" strokeWidth={1.8} /> : <ChevronLeft className="size-[17px]" strokeWidth={1.8} />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-6" aria-label="工作区">
        {!collapsed && <p className="mb-3 px-3 font-mono text-caption2 uppercase tracking-[0.2em] text-text-muted">Workspace</p>}
        <ul className="space-y-1.5">
          {NAV_ENTRIES.map((item, index) => {
            const active = activeId === item.id;
            const Icon = item.Icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "focus-ring group relative flex items-center rounded-lg py-3 transition-colors duration-200",
                    collapsed ? "justify-center px-2" : "gap-3 px-3",
                    active ? "nav-pill-active" : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
                  )}
                >
                  <Icon aria-hidden="true" className="size-[19px] shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={active ? 2 : 1.6} />
                  {!collapsed && <span className={cn("truncate text-subheadline", active ? "font-semibold" : "font-normal")}>{item.label}</span>}
                  {!collapsed && <span className="ml-auto font-mono text-caption2 text-text-muted">0{index + 1}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-border-subtle p-3">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-1")}>
          {!collapsed && <span className="font-mono text-caption2 uppercase tracking-[0.14em] text-text-muted">Theme</span>}
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
