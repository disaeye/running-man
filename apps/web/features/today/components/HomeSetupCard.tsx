"use client";

import Link from "next/link";
import { Card } from "@shared/ui/Card";
import type { UserProfile } from "@shared/lib/auth";
import { countRecordedThresholds } from "@features/settings/lib/thresholds";

interface Props {
  /** The resolved connection state; `error` is not the same as still reading. */
  readonly connection: "loading" | "error" | "connected" | "disconnected";
  readonly lastSync: string | null;
  readonly profile: UserProfile | null;
}

interface Step {
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly action: string;
}

/**
 * What a page with no training data at all shows.
 *
 * The steps describe the athlete's real state. The card used to offer "连接数据源
 * / 去连接" and "填写阈值 / 去填写" unconditionally, so an athlete who had already
 * connected Intervals.icu and filled all four thresholds was told to do both —
 * while the data settings showed 已连接 and the settings page showed 已填写 4/4 项阈值.
 */
export function HomeSetupCard({ connection, lastSync, profile }: Props) {
  const recorded = countRecordedThresholds(profile);
  const steps: Step[] = [];

  if (connection === "loading") {
    steps.push({
      title: "正在读取数据源状态",
      body: "连接状态确认后，这里会显示下一步。",
      href: "/settings?section=data",
      action: "数据页",
    });
  } else if (connection === "error") {
    steps.push({
      title: "读不到数据源状态",
      body: "请求失败，无法判断是否已连接。去数据页查看当前状态。",
      href: "/settings?section=data",
      action: "检查数据源",
    });
  } else if (connection === "connected") {
    steps.push({
      title: "Intervals.icu 已连接",
      body: lastSync
        ? `最后同步 ${lastSync.slice(0, 10)}。还没读到训练记录，可以在数据页手动同步一次。首次同步只覆盖最近 30 天，更早的历史需要用数据页的历史回填工具导入。`
        : "还没有同步过。在数据页发起一次同步，训练记录会填进这里。首次同步只覆盖最近 30 天，更早的历史需要用数据页的历史回填工具导入。",
      href: "/settings?section=data",
      action: "去同步",
    });
  } else {
    steps.push({
      title: "连接数据源",
      body: "用 Intervals.icu 把历史活动、心率和睡眠同步进来。首次同步覆盖最近 30 天，更早的历史用数据页的历史回填工具补齐。",
      href: "/settings?section=data",
      action: "去连接",
    });
  }

  if (recorded < 4) {
    steps.push({
      title: recorded === 0 ? "填写阈值" : `补全阈值（已填 ${recorded}/4）`,
      body: "最大心率、静息心率、乳酸阈心率和阈值配速决定心率与配速区间。",
      href: "/settings?section=training",
      action: "去填写",
    });
  }

  steps.push({
    title: "回来看今天的建议",
    body: "有数据之后，这里会给出今天该练什么、强度多少，以及为什么。",
    href: "/analysis",
    action: "了解分析",
  });

  const connectedWithNoData = connection === "connected";

  return (
    <Card padding="lg" data-testid="home-starting-point">
      <h2 className="text-title2 font-semibold text-text-primary">
        {connectedWithNoData ? "已连接，还没有同步到训练数据" : "还没有可分析的训练数据"}
      </h2>
      <p className="mt-2 max-w-2xl text-subheadline leading-relaxed text-text-secondary">
        这个页面回答「今天该做什么」。它需要一点数据才能开始。
      </p>
      <ol className="mt-5 flex flex-col">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border-subtle py-3"
          >
            <span className="font-mono text-caption1 text-text-muted">{index + 1}</span>
            <span className="text-subheadline font-medium text-text-primary">{step.title}</span>
            <span className="text-caption1 text-text-muted">{step.body}</span>
            <Link
              href={step.href}
              className="focus-ring tactile ml-auto inline-flex min-h-11 items-center rounded px-2 text-caption1 font-medium text-accent-strong underline-offset-4 hover:underline"
            >
              {step.action}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
