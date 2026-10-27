import { type ReactNode } from "react";

interface CardHeaderProps {
  icon?: ReactNode;
  title: string;
  trailing?: ReactNode;
}

/**
 * 卡片头部信息带。
 *
 * 一行解决三件事：这是哪张卡（icon + 12px 标题）、这张卡当前处于什么状态
 * （trailing 右端对齐）、下面是内容。标题固定 12px 的 caption1，所以卡内
 * 不会出现两个同级的 22px 标题在抢视线。
 */
export function CardHeader({ icon, title, trailing }: CardHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon && (
          <span
            aria-hidden="true"
            className="grid size-5 shrink-0 place-items-center text-text-muted"
          >
            {icon}
          </span>
        )}
        <h3 className="text-caption1 font-semibold text-text-secondary">
          {title}
        </h3>
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      )}
    </div>
  );
}
