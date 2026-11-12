"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@shared/lib/utils";
import { SlidingIndicator } from "@shared/ui/SlidingIndicator";
import { NAV_ENTRIES, activeNavFromPath } from "@shared/config/nav-config";

export { activeNavFromPath as activeTabFromPath } from "@shared/config/nav-config";

const CSS_VAR = "--mobile-nav-height";

/**
 * Bottom tab bar for mobile (< 768px).
 *
 * 五个入口对应今天、训练、分析、目标和我的。
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
      data-indicator-container="mobile"
      data-layout-token="mobile-nav"
      data-shell-region="bottom"
      data-safe-area="bottom"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-surface-card/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg"
    >
      <div className="relative mx-auto grid h-14 max-w-2xl grid-cols-5">
        <SlidingIndicator
          variant="underline"
          options={NAV_ENTRIES.map((tab) => ({ key: tab.id, selected: tab.id === activeId }))}
        />
        {NAV_ENTRIES.map((tab) => {
          const isActive = tab.id === activeId;
          const Icon = tab.Icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              data-indicator-key={tab.id}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "tactile focus-ring relative z-10 flex min-w-0 flex-col items-center justify-center gap-1 select-none",
                isActive
                  ? "text-accent-strong"
                  : "text-text-muted hover:text-text-primary",
              )}
            >
              <Icon aria-hidden="true" className="size-5 stroke-[2]" />
              <span
                className={cn(
                  "text-caption1 leading-tight",
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
