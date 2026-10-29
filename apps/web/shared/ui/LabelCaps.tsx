import { type ReactNode } from "react";

/**
 * 卡片头部的拉丁大写标签。
 *
 * 参考稿里每张卡的顶部都是一行窄体大写标签（READINESS SCORE、WEEKLY
 * VOLUME），它说明这张卡回答什么问题。中文标签保持原样，不做全大写转换，
 * 因为中文没有大写这一形态。
 */
export function LabelCaps({
  children,
  className = "",
  icon,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** 标签前的小图标，用 Material Symbols 名称或任意节点。 */
  readonly icon?: ReactNode;
}) {
  return (
    <span
      className={`label-caps inline-flex items-center gap-1.5 text-caption1 text-text-muted ${className}`.trim()}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}
