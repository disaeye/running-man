import type { HTMLAttributes, ReactNode } from "react";

export type CardAccent = "none" | "accent" | "success" | "warn" | "error";

interface CardProps extends HTMLAttributes<HTMLElement> {
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "content" | "action";
  as?: "div" | "section";
  accent?: CardAccent;
}

const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-5 sm:p-8",
} as const;

const VARIANT = {
  content: "border-border-subtle bg-surface-card",
  action: "border-accent-strong/30 bg-surface-raised shadow-[var(--shadow-panel)]",
} as const;

const ACCENT_BORDER: Record<CardAccent, string> = {
  none: "",
  accent: "border-l-[3px] border-l-accent-strong",
  success: "border-l-[3px] border-l-success",
  warn: "border-l-[3px] border-l-warn",
  error: "border-l-[3px] border-l-error",
};

/**
 * 唯一的面板原语。
 *
 * 层级通过画布与面板的明度阶梯 + 1px 低对比度外发丝边确立。
 * `--shadow-panel` 只给焦点行动卡：`variant="action"` 时加，一屏最多一张。
 * 内容卡不加阴影，圆角统一 16px（`rounded-2xl`）。
 *
 * 卡片不嵌套。卡内分组用 `InsetBlock`（无边框下沉槽）或 `divide-y`。
 */
export function Card({
  padding = "md",
  variant = "content",
  as = "div",
  accent = "none",
  className = "",
  children,
  ...props
}: CardProps) {
  const Component = as;
  return (
    <Component
      className={`min-w-0 rounded-2xl border text-text-primary ${PADDING[padding]} ${VARIANT[variant]} ${ACCENT_BORDER[accent]} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * 带标准眉标与右侧操作槽的内容卡片，直接复用统一 `Card` 表面原语。
 */
export function PageCard({
  title,
  action,
  children,
  className = "",
  hero = false,
  accent = "none",
  testId,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  hero?: boolean;
  accent?: CardAccent;
  testId?: string;
}) {
  return (
    <Card
      as="section"
      padding="none"
      variant={hero ? "action" : "content"}
      accent={accent}
      data-testid={testId}
      className={`p-4 sm:p-5 ${className}`.trim()}
    >
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h2 className="eyebrow min-w-0 truncate">{title}</h2> : <span />}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </Card>
  );
}
