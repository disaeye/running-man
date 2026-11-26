"use client";

import { TrainingShell } from "@features/training/components/TrainingShell";

/**
 * 训练工作区：日历、记录、力量三个页面共用一个页头与二级导航，
 * 「添加训练」入口只在这里出现一次。活动详情页 `/activities/[id]` 留在路由组之外，
 * 不带二级导航，保持单次分析的沉浸式返回。
 */
export default function TrainingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <TrainingShell>{children}</TrainingShell>;
}
