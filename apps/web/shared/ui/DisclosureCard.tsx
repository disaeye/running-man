"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface DisclosureCardProps {
  readonly title: string;
  readonly summary?: ReactNode;
  readonly badge?: ReactNode;
  readonly action?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (next: boolean) => void;
  readonly alwaysShowSummary?: boolean;
  readonly headingAs?: "h2" | "h3";
  readonly testId?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * 渐进式披露折叠卡片：
 * 收起态展示标题 + 单行核心摘要（L1），展开后呈现明细内容（L2/L3）。
 * 头部动作按钮作为折叠按钮的兄弟节点渲染，避免嵌套交互控件。
 */
export function DisclosureCard({
  title,
  summary,
  badge,
  action,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  alwaysShowSummary = false,
  headingAs = "h2",
  testId,
  className = "",
  children,
}: DisclosureCardProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? internalOpen;
  const Heading = headingAs;

  const toggle = () => {
    const next = !isOpen;
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      data-testid={testId}
      className={`surface overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          className="focus-ring tactile flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-lg text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Heading className="text-subheadline font-semibold text-text-primary">
                {title}
              </Heading>
              {badge}
            </div>
            {(!isOpen || alwaysShowSummary) && summary ? (
              <div className="mt-0.5 text-caption1 text-text-muted">
                {summary}
              </div>
            ) : null}
          </div>
          <ChevronDown
            className={`size-4 shrink-0 text-text-muted transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {isOpen ? (
        <div className="border-t border-border-subtle px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
