"use client";

import { useState, type ReactNode } from "react";

/**
 * 路由入场的淡入，只给没有浏览器 View Transition 接管的导航。
 *
 * template 在每次导航提交时重新挂载，所以挂载那一刻 `data-route-vt` 是否存在
 * 就决定了这一次由谁负责过渡：存在时由 View Transition 交叉淡入完成，这里
 * 不再叠加动画；不存在时（Firefox、旧版 Safari、超时放行、后退手势）由这里
 * 做一次 180ms 透明度淡入。首屏水合时该属性一定不存在，与服务端渲染一致。
 */
export function RouteArrival({ children }: { readonly children: ReactNode }) {
  const [underViewTransition] = useState(
    () => typeof document !== "undefined" && document.documentElement.hasAttribute("data-route-vt"),
  );
  return <div className={underViewTransition ? undefined : "route-arrival"}>{children}</div>;
}
