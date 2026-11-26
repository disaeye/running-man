import { Suspense } from "react";
import { RouteCrossfade } from "@shared/layout/RouteCrossfade";
import { RouteArrival } from "@shared/layout/RouteArrival";

/**
 * 路由入场只作用于内容列。导航外壳由 DashboardShell 持有，不随 template 重挂载。
 * Suspense 只包住依赖 useSearchParams 的协调器。
 */
export default function DashboardTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Suspense fallback={null}>
        <RouteCrossfade />
      </Suspense>
      <RouteArrival>{children}</RouteArrival>
    </>
  );
}
