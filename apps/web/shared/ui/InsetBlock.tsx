import { type HTMLAttributes, type ReactNode } from "react";

type InsetBlockTone = "default" | "accent" | "warn";

interface InsetBlockProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: InsetBlockTone;
}

const TONE_STYLES: Record<InsetBlockTone, string> = {
  default: "bg-transparent",
  accent: "border-l-2 border-l-accent-strong bg-transparent",
  warn: "border-l-2 border-l-warning bg-warning/10",
};

/**
 * 卡片内部的分组块。
 *
 * 普通信息组使用留白、字重和分隔线组织。只有需要注意的状态保留语义底色，
 * 主要判断使用左边指示线；卡片与临时浮层继续负责表面层级。
 */
export function InsetBlock({
  tone = "default",
  className = "",
  children,
  ...props
}: InsetBlockProps) {
  return (
    <div
      className={`min-w-0 border-t border-border-subtle px-4 py-3 first:border-t-0 ${TONE_STYLES[tone]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
