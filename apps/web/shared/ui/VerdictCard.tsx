import type { ReactNode } from "react";
import { Card, type CardAccent } from "@shared/ui/Card";

export interface VerdictCardProps {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly badge?: ReactNode;
  readonly accent?: Exclude<CardAccent, "none">;
  readonly metrics?: ReactNode;
  readonly banner?: ReactNode;
  readonly reasoning?: ReactNode;
  readonly details?: ReactNode;
  readonly footer?: ReactNode;
  readonly testId?: string;
  readonly className?: string;
}

/**
 * 结论先行行动卡片原语：左 3px 状态强调条 + 眉标/状态徽章 + 核心标题 +
 * 焦点读数网格 + 原因/步骤下沉槽 + 行动页脚。
 */
export function VerdictCard({
  eyebrow,
  title,
  badge,
  accent = "accent",
  metrics,
  banner,
  reasoning,
  details,
  footer,
  testId,
  className = "",
}: VerdictCardProps) {
  return (
    <Card
      as="section"
      padding="none"
      variant="action"
      accent={accent}
      data-testid={testId}
      className={`relative p-4 sm:p-5 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 basis-40">
          <div className="eyebrow mb-1">{eyebrow}</div>
          <h2 className="text-title1 font-bold text-text-primary sm:text-conclusion">{title}</h2>
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {metrics ? <div className="mt-3">{metrics}</div> : null}
      {banner ? <div className="mt-3">{banner}</div> : null}
      {reasoning ? <div className="mt-3">{reasoning}</div> : null}
      {details ? <div className="mt-3">{details}</div> : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </Card>
  );
}
