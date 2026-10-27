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
      className="fixed bottom-0 left-[max(0px,env(safe-area-inset-left))] right-[max(0px,env(safe-area-inset-right))] z-40 border-t border-border-subtle bg-surface-base px-3 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 md:hidden"
    >
      <div className="grid grid-cols-5">
        {MOBILE_TAB_ENTRIES.map((tab) => {
          const isActive = tab.id === activeId;
          const Icon = tab.Icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "row-press focus-ring relative flex min-h-[50px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 select-none transition-colors duration-150",
                isActive
                  ? "text-accent-strong"
                  : "text-text-muted hover:text-text-primary",
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-[22px] transition-transform duration-200",
                  isActive ? "stroke-[2.1]" : "stroke-[1.7]",
                )}
              />
              <span
                className={cn(
                  "text-caption1 leading-tight transition-colors duration-150",
                  isActive ? "font-semibold" : "font-normal",
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
