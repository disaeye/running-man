"use client";

import { Suspense } from "react";
import { StrengthSessionEditor } from "@features/strength/components/StrengthSessionEditor";

/**
 * 力量工作台：`?tab=log|analytics` 切换记录训练与历史分析，
 * `?date=` 预填记录训练的日期（从日历或补录入口跳转时带入）。
 */
export default function StrengthPage() {
  return (
    <Suspense fallback={null}>
      <StrengthSessionEditor />
    </Suspense>
  );
}
