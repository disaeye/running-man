"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@shared/ui/button";

export type ListPagerProps = {
  readonly page: number;
  readonly totalPages: number;
  readonly totalItems?: number;
  readonly onPageChange: (page: number) => void;
  readonly className?: string;
};

/**
 * Compact browse pager: ‹  1/8  ›  with optional "共 N 条".
 * Zero-based `page`; hides itself when totalPages <= 1 and no totalItems.
 */
export function ListPager({
  page,
  totalPages,
  totalItems,
  onPageChange,
  className = "",
}: ListPagerProps) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(0, page), safeTotal - 1);
  const showNav = safeTotal > 1;

  if (!showNav && totalItems == null) {
    return null;
  }

  return (
    <div
      data-testid="list-pager"
      className={`flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-2 sm:px-6 ${className}`.trim()}
    >
      <span className="text-caption1 text-text-muted" data-testid="list-pager-total">
        {totalItems != null ? `共 ${totalItems} 条` : "\u00a0"}
      </span>
      {showNav ? (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={safePage === 0}
            aria-label="上一页"
            onClick={() => onPageChange(Math.max(0, safePage - 1))}
          >
            <ChevronLeft />
          </Button>
          <span
            className="min-w-[3.5rem] text-center font-mono text-caption1 tabular-nums text-text-secondary"
            data-testid="list-pager-position"
          >
            {safePage + 1}/{safeTotal}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={safePage >= safeTotal - 1}
            aria-label="下一页"
            onClick={() => onPageChange(Math.min(safeTotal - 1, safePage + 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
