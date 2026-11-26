"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SlidingIndicator } from "@shared/ui/SlidingIndicator";
import { cn } from "@shared/lib/utils";
import { TRAINING_TABS, activeTrainingTabFromPath } from "@shared/config/training-nav";

/**
 * 训练工作区的二级导航：日历、记录、力量。
 * 每个入口只带自己的路径，切换时不携带其他入口的查询参数。
 */
export function TrainingTabs({ className = "" }: { readonly className?: string }) {
  const pathname = usePathname();
  const activeId = activeTrainingTabFromPath(pathname);
  return (
    <nav
      aria-label="训练分区"
      data-testid="training-tabs"
      className={cn("relative flex rounded-full bg-secondary p-1", className)}
    >
      <SlidingIndicator
        variant="accent-pill"
        options={TRAINING_TABS.map((tab) => ({ key: tab.id, selected: tab.id === activeId }))}
      />
      {TRAINING_TABS.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            prefetch
            data-indicator-key={tab.id}
            aria-current={active ? "page" : undefined}
            data-testid={`training-tab-${tab.id}`}
            className={cn(
              "tactile relative z-10 inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-transparent px-3 text-xs font-medium",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-text-primary",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
