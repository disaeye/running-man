import Link from "next/link";
import { ChevronRight, ListFilter } from "lucide-react";

/**
 * 「完整记录与筛选」的统一入口：日历流水视图与分析页共用，
 * 指向训练记录页（/activities）——全站最强的检索界面。
 */
export function BrowseAllLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/activities"
      data-testid="browse-all-activities"
      className={`surface tactile flex items-center gap-3 p-4 ${className}`.trim()}
    >
      <ListFilter className="h-6 w-6 text-accent-strong" aria-hidden />
      <span className="flex-1">
        <span className="block font-semibold">完整记录与筛选</span>
        <span className="block text-xs text-text-muted">按强度、比赛、GPS、来源筛选全部历史</span>
      </span>
      <ChevronRight className="h-5 w-5 text-text-muted" aria-hidden />
    </Link>
  );
}
