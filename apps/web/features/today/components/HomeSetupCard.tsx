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
  readonly syncing?: boolean;
  readonly onSync?: () => void;
}

interface Step {
  readonly title: string;
  readonly body: string;
  readonly href?: string;
  readonly onAction?: () => void;
  readonly disabled?: boolean;
  readonly action: string;
}

export function HomeSetupCard({ connection, lastSync, profile, syncing = false, onSync }: Props) {
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
        ? `最后同步 ${lastSync.slice(0, 10)}。还没读到训练记录，可以直接在这里发起同步（更早历史可去数据页回填）。`
        : "还没有同步过。可以直接发起一次同步（首次默认拉最近 30 天，更早记录可在数据页回填）。",
      ...(onSync
        ? {
            onAction: onSync,
            disabled: syncing,
            action: syncing ? "同步中…" : "立即同步",
          }
        : {
            href: "/settings?section=data",
            action: "去同步",
          }),
    });
  } else {
    steps.push({
      title: "连接数据源",
      body: "用 Intervals.icu 同步历史活动、心率与睡眠，或手动补录你的第一次训练。",
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
    title: "也可以先手动安排训练",
    body: "在训练日历中补录一次训练或按目标生成训练计划，首页会自动给出今日建议。",
    href: "/calendar",
    action: "去训练页",
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
            className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-3 gap-y-1 border-t border-border-subtle py-3"
          >
            <span className="font-mono text-caption1 text-text-muted">{index + 1}</span>
            <div className="min-w-0">
              <p className="text-subheadline font-medium text-text-primary">{step.title}</p>
              <p className="mt-0.5 text-caption1 text-text-muted">{step.body}</p>
            </div>
            {step.onAction ? (
              <button
                type="button"
                disabled={step.disabled}
                onClick={step.onAction}
                className="focus-ring tactile inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-caption1 font-medium text-accent-strong underline-offset-4 hover:bg-secondary hover:underline disabled:opacity-60"
              >
                {step.action}
              </button>
            ) : (
              <Link
                href={step.href ?? "/settings?section=data"}
                className="focus-ring tactile inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-caption1 font-medium text-accent-strong underline-offset-4 hover:bg-secondary hover:underline"
              >
                {step.action}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
