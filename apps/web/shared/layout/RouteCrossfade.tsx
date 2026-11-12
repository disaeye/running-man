"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface ViewTransitionHandle {
  readonly finished: Promise<void>;
  skipTransition: () => void;
}

type StartViewTransition = (callback: () => Promise<void>) => ViewTransitionHandle;

/** 导航在 400ms 内没有落地时结束过渡，避免页面停在旧快照上。 */
const NAVIGATION_TIMEOUT_MS = 400;

/**
 * 跨路由的交叉淡入。
 *
 * Next 的 App Router 自己完成导航，这里只把「旧页 → 新页」这一段包进
 * View Transition：不拦截默认行为，也不改 href。updateCallback 返回的
 * Promise 在 usePathname / useSearchParams 变化后 resolve，那时 React 已经
 * 提交新 DOM，浏览器正好捕获新快照。
 *
 * 浏览器不支持 View Transition、用户要求减少动态效果、或导航迟迟没有落地时，
 * 一律直接放行，由 template.tsx 的短入场兜底。
 */
export function RouteCrossfade() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const pending = useRef<(() => void) | null>(null);
  const active = useRef<ViewTransitionHandle | null>(null);

  useEffect(() => {
    pending.current?.();
    pending.current = null;
  }, [routeKey]);

  useEffect(() => {
    const start = (
      document as Document & { startViewTransition?: StartViewTransition }
    ).startViewTransition;
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const destination = `${url.pathname}${url.search}`;
      if (destination === `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`) return;

      active.current?.skipTransition();
      pending.current?.();
      document.documentElement.setAttribute("data-route-vt", "");

      const transition = start(
        () =>
          new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              pending.current = null;
              resolve();
            };
            pending.current = finish;
            window.setTimeout(finish, NAVIGATION_TIMEOUT_MS);
          }),
      );
      active.current = transition;
      void transition.finished
        .catch(() => undefined)
        .finally(() => {
          active.current = null;
          // 下一帧再移除，保证新页挂载时 page-arrival 仍被抑制。
          window.requestAnimationFrame(() => {
            document.documentElement.removeAttribute("data-route-vt");
          });
        });
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      pending.current?.();
      pending.current = null;
    };
  }, [pathname, searchParams]);

  return null;
}
