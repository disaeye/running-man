"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Activity } from "lucide-react";
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
 *
 * 数字键 1-5 直接切换五个主导航页；输入控件获得焦点时不拦截。
 *
 * 五个入口始终在视口内，`prefetch` 让每条路由的完整 RSC 在首屏就被预取并进入
 * 路由缓存（Next 对完整预取的动态路由保留 5 分钟），Tab 之间切换不再等待源站响应。
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = activeNavFromPath(pathname);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const publish = () => {
      const desktopOffset = window.innerWidth >= 1024 ? 16 : 0;
      document.documentElement.style.setProperty(
        CSS_VAR,
        `${el.offsetHeight + desktopOffset}px`,
      );
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty(CSS_VAR);
    };
  }, []);

  // 数字键 1-5 切换主导航（弹窗打开或输入法组合期间不触发）。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !/^[1-5]$/.test(event.key) ||
        document.querySelector('[role="dialog"]') !== null ||
        (target &&
          (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
      ) {
        return;
      }
      const entry = NAV_ENTRIES[Number(event.key) - 1];
      if (!entry || entry.href === pathname) return;
      router.push(entry.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);

  return (
    <nav
      ref={navRef}
      aria-label="主导航"
      data-indicator-container="mobile"
      data-layout-token="mobile-nav"
      data-shell-region="bottom"
      data-safe-area="bottom"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-surface-card/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:top-4 lg:bottom-auto lg:left-1/2 lg:right-auto lg:w-[calc(100%-2rem)] lg:max-w-4xl lg:-translate-x-1/2 lg:rounded-full lg:border lg:border-border-default lg:bg-surface-card/90 lg:px-2 lg:pb-0 lg:shadow-elevated"
    >
      <div data-nav-row className="relative mx-auto flex h-14 max-w-2xl lg:max-w-none lg:gap-1">
        <div
          aria-label="Running Man"
          className="mr-3 hidden w-40 shrink-0 items-center gap-2.5 px-3 lg:flex"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
            <Activity className="size-5 stroke-[2.5]" aria-hidden="true" />
          </span>
          <span className="min-w-0 leading-none">
            <span className="block truncate text-callout font-semibold tracking-tight text-text-primary">RUNNING MAN</span>
            <span className="mt-1 block text-caption1 text-text-muted">个人训练记录</span>
          </span>
        </div>
        <div className="relative grid min-w-0 flex-1 grid-cols-5">
        <SlidingIndicator
          variant="underline"
          options={NAV_ENTRIES.map((tab) => ({ key: tab.id, selected: tab.id === activeId }))}
        />
        {NAV_ENTRIES.map((tab, index) => {
          const isActive = tab.id === activeId;
          const Icon = tab.Icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              prefetch
              data-indicator-key={tab.id}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "tactile focus-ring relative z-10 my-1 mx-0.5 flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl select-none transition-colors lg:flex-row lg:gap-1.5 lg:rounded-full",
                isActive
                  ? "bg-accent/10 text-accent-strong"
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
              <kbd className="num hidden rounded bg-surface-overlay px-1 text-caption2 text-text-muted xl:inline-flex" aria-hidden="true">
                {index + 1}
              </kbd>
            </Link>
          );
        })}
        </div>
      </div>
    </nav>
  );
}
