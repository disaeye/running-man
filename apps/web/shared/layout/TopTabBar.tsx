"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@shared/lib/utils";
import { MOBILE_TAB_ENTRIES, activeNavFromPath } from "@shared/config/nav-config";

export { activeNavFromPath as activeTabFromPath } from "@shared/config/nav-config";

const CSS_VAR = "--mobile-nav-height";

/**
 * Bottom tab bar for mobile (< 768px).
 *
 * 5 tabs: 今天 / 训练 / 分析 / 目标 / 设置.
 * Measures its own height and publishes it as a CSS custom property
 * so the main scroll region can compute bottom padding dynamically.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const activeId = activeNavFromPath(pathname);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        CSS_VAR,
        `${el.offsetHeight}px`,
      );
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty(CSS_VAR);
    };
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="移动端主导航"
      data-layout-token="mobile-nav"
      data-shell-region="bottom"
      data-safe-area="bottom"
      className="fixed bottom-0 left-[max(0px,env(safe-area-inset-left))] right-[max(0px,env(safe-area-inset-right))] z-40 border-t border-border-subtle/80 bg-surface-raised/90 px-3 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_24px_rgba(0,0,0,0.05)] backdrop-blur-2xl md:hidden"
    >
      <div className="grid grid-cols-5 gap-1.5">
        {MOBILE_TAB_ENTRIES.map((tab) => {
          const isActive = tab.id === activeId;
          const Icon = tab.Icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "focus-ring relative flex min-h-[50px] min-w-0 flex-col items-center justify-center rounded-xl px-1 py-1 select-none transition-all duration-150 active:scale-90",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:bg-surface-overlay/60 hover:text-text-primary active:opacity-75",
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-5 transition-transform duration-200",
                  isActive ? "scale-105 stroke-[2.2]" : "stroke-[1.7]",
                )}
              />
              <span
                className={cn(
                  "mt-1 text-caption2 leading-tight transition-colors duration-150",
                  isActive ? "font-semibold text-primary" : "font-normal",
                )}
              >
                {tab.label}
              </span>
              {isActive && (
                <span
                  className="absolute bottom-1 h-0.5 w-3 rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)] transition-all duration-200"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
