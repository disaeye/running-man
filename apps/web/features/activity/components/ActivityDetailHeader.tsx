import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";

/**
 * 活动详情页头部：返回链接、项目名、日期与来源，右侧是操作按钮组。
 *
 * `shareSlot` 由页面传进来（分享按钮 + 旗标操作），这样 `ShareDialog` 与
 * `ActivityFlagActions` 的状态都留在页面里，头部只负责构图。
 *
 * 数据流状态按钮的文案必须保持 `数据流状态` 与 `隐藏数据流状态`，
 * e2e 用 button 名定位它。
 */
export function ActivityDetailHeader({
  sportLabel,
  dateLabel,
  source,
  technicalOpen,
  onToggleTechnical,
  shareSlot,
}: {
  readonly sportLabel: string;
  readonly dateLabel: string;
  readonly source: string | null;
  readonly technicalOpen: boolean;
  readonly onToggleTechnical: () => void;
  readonly shareSlot: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <Link
          href="/activities"
          className="focus-ring inline-flex items-center gap-1 rounded text-caption1 text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          训练记录
        </Link>
        <h1 className="mt-1 text-display-sm font-semibold tracking-tight text-text-primary">
          {sportLabel}
        </h1>
        <p className="mt-1 text-caption1 text-text-muted">
          {dateLabel}
          {source ? ` · ${source}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleTechnical}
          aria-expanded={technicalOpen}
          className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-full border border-border-default px-3 text-caption1 font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <Info className="size-3.5" aria-hidden="true" />
          {technicalOpen ? "隐藏数据流状态" : "数据流状态"}
        </button>
        {shareSlot}
      </div>
    </header>
  );
}
