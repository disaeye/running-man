import { Suspense } from "react";
import { RouteCrossfade } from "@shared/layout/RouteCrossfade";

/**
 * 路由入场只作用于内容列。导航外壳由 DashboardShell 持有，不随 template 重挂载。
 *
 * 浏览器接管 View Transition 时，全局 data-route-vt 会关闭这个入场，避免
 * 两段动画叠在一起。Suspense 只包住依赖 useSearchParams 的协调器。
 */
export default function DashboardTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Suspense fallback={null}>
        <RouteCrossfade />
      </Suspense>
      <div className="page-arrival">{children}</div>
    </>
  );
}
