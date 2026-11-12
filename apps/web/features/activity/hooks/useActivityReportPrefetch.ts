"use client";

import { useActivityAnalysis } from "./useActivityAnalysis";
import { useActivityLaps } from "./useActivityLaps";

/**
 * 详情页首屏预取分析与分段。
 *
 * 页面在 `useActivityDetail` 返回前会先渲染加载态，子组件 `DemoActivityReport`
 * 那时还没挂载，其中的分析/分段请求因此被推迟到第二轮。这里在路由层用相同
 * 的 SWR key 提前发起，SWR 去重后子组件直接复用结果，四个请求同一波发出。
 */
export function useActivityReportPrefetch(id: string | undefined): void {
  useActivityAnalysis(id);
  useActivityLaps(id);
}
