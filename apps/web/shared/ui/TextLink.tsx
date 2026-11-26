import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@shared/lib/utils";

interface TextLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  /** 离开当前页面才带箭头；页内展开、切换与折叠入口不带。 */
  readonly arrow?: boolean;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * 全站唯一的行内文字链接：次级正文色、发丝下划线、统一按压反馈。
 * 卡片右上角的操作槽与段落里的链接都用它，不再各自拼写下划线与箭头。
 */
export function TextLink({ href, children, arrow = false, className = "", testId }: TextLinkProps) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        "tactile focus-ring inline-flex min-h-11 min-w-11 items-center gap-0.5 text-subheadline font-medium text-text-secondary underline decoration-border-strong underline-offset-4 hover:text-text-primary hover:decoration-text-secondary",
        className,
      )}
    >
      {children}
      {arrow ? <ChevronRight className="size-4 shrink-0" aria-hidden="true" /> : null}
    </Link>
  );
}
