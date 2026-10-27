import { type HTMLAttributes, type ReactNode } from "react";

type InsetBlockTone = "default" | "accent";

interface InsetBlockProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: InsetBlockTone;
}

const TONE_STYLES: Record<InsetBlockTone, string> = {
  default: "bg-surface-overlay",
  accent: "bg-accent/8",
};

/**
 * 卡片内部的分组块。
 *
 * 卡片之间不嵌套，卡内分组只靠一层比卡片略深的底色区分，不画边线——
 * 边线留给真正的层级边界（Card 与画布之间），卡内再画一条就成了两层框。
 * 底色本身承担分组，所以文件里没有 border 类。
 */
export function InsetBlock({
  tone = "default",
  className = "",
  children,
  ...props
}: InsetBlockProps) {
  return (
    <div
      className={`min-w-0 rounded-xl px-4 py-3 ${TONE_STYLES[tone]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
