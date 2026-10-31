import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "content" | "action";
}

const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-5 sm:p-8",
} as const;

const VARIANT = {
  content: "",
  action: "shadow-[var(--shadow-panel)]",
} as const;

/**
 * 唯一的面板原语。
 *
 * 层级靠明度差分界：画布是 `--color-surface-sunken`，卡片是 `--color-surface-card`，
 * 卡片比画布亮一档，眼睛就能分出层。因此卡片不加边线——画布已经换掉了，
 * 再画一条 1px 发丝边就是第二层框。
 *
 * `--shadow-panel` 只给行动卡：`variant="action"` 时加，一屏最多一张。
 * 内容卡不加阴影。
 *
 * `--shadow-panel` 没有进 `@theme inline`，Tailwind 生成不出 `shadow-panel`，
 * 所以这里用方括号直接读 CSS 变量。
 *
 * 卡片不嵌套。一组的若干张卡片用 `page-stack` 或 grid 排；
 * 卡内分组用 `InsetBlock` 或 `divide-y`，不再套一张卡。
 *
 * 手机上一律 20px 内边距（`sm`、`md` 相同），一行文字在相邻卡片里能对齐；
 * 更宽的内边距从 `sm` 起才有空间花。
 */
export function Card({
  padding = "md",
  variant = "content",
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`min-w-0 rounded-[18px] border border-border-subtle bg-surface-card text-text-primary ${PADDING[padding]} ${VARIANT[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
