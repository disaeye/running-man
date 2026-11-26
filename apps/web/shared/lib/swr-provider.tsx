"use client";

import type { ReactNode } from "react";
import { SWRConfig, type Middleware } from "swr";
import { swrFetcher } from "@shared/lib/swr-fetcher";

/**
 * 让 `isLoading` 只表示「当前没有任何可展示的数据」。
 *
 * SWR 的 `isLoading` 在 key 变化时重新计数，即使 `keepPreviousData` 让 `data`
 * 仍然持有上一组结果，它也会回到 true。页面里到处是 `loading ? <Skeleton/> :
 * <Content/>`，这样的语义会让每一次切周期、切 Tab 都先回到骨架屏。
 * 这里把 `isLoading` 收窄为「请求进行中且 data 为空」，`isValidating` 仍然表示
 * 请求进行中，需要「正在刷新」提示的地方读它。
 */
const presentPreviousData: Middleware = (useSWRNext) => (key, fetcher, config) => {
  const swr = useSWRNext(key, fetcher, config);
  const rawLoading = Object.getOwnPropertyDescriptor(swr, "isLoading");
  if (!rawLoading?.get) {
    throw new Error("SWR 响应缺少 isLoading 读取器，无法应用 presentPreviousData 中间件");
  }
  const readLoading = rawLoading.get;
  Object.defineProperty(swr, "isLoading", {
    configurable: true,
    enumerable: true,
    get: () => readLoading.call(swr) && swr.data === undefined,
  });
  return swr;
};

/**
 * Global SWR configuration.
 *
 * - keepPreviousData: 切换日期范围、Tab 或分页时继续展示上一组数据，新数据到达后
 *   由各组件（ECharts 插值、列表重排）原地更新，不再先回到骨架屏。
 * - revalidateOnFocus: disabled to avoid surprising global refetches; hooks
 *   with user-triggered mutations invalidate their own cache entries.
 * - dedupingInterval: 5s window collapses in-flight + just-completed identical
 *   requests (PMC 90d fetched by both TodayStatusBar and PmcTrendChart → 1 request).
 * - refreshInterval: 0 (polling is opt-in per-hook via useSWR's refreshInterval).
 */
export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        keepPreviousData: true,
        use: [presentPreviousData],
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        refreshInterval: 0,
      }}
    >
      {children}
    </SWRConfig>
  );
}
