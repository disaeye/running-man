"use client";

import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { useShoes } from "@features/activity/hooks/useGear";
import type { ShoeWithStats } from "@shared/types/gear";

type ShoeStatus = { readonly label: string; readonly className: string };

/**
 * 状态词的优先级：退役的事已经发生，比更换提醒更该先读。
 * 状态只在这里判一次，行里不再各自拼条件。
 */
function shoeStatus(shoe: ShoeWithStats): ShoeStatus {
  if (shoe.retired_at !== null) return { label: "已退役", className: "text-text-muted" };
  if (shoe.retirement_alert) return { label: "建议更换", className: "text-warning" };
  return { label: "正常", className: "text-text-muted" };
}

/** 累计里程按公里一位小数；接口存的是米。 */
function mileageKm(shoe: ShoeWithStats): string {
  return (shoe.current_mileage_m / 1000).toFixed(1);
}

/**
 * 档案页的跑鞋清单：每双鞋一行，读的是活动同步累计出来的里程。
 *
 * 本轮只读。登记、退役、绑定都在活动详情里做，这里不给入口——
 * 一个只有读的清单配一个半套表单，比没有入口更让人以为改到了。
 */
export function GearSection() {
  const { data: shoes, loading, error } = useShoes();
  // 头部只数在役的鞋：退役的鞋不再是「现有」。
  const activeCount = shoes.filter((shoe) => shoe.retired_at === null).length;
  const empty = shoes.length === 0;

  return (
    <Card padding="md" data-testid="gear-section">
      <CardHeader
        title="跑鞋"
        trailing={
          <span className="text-caption1 text-text-muted">{activeCount} 双</span>
        }
      />

      {empty && loading ? (
        <p className="text-caption1 text-text-muted">正在读取跑鞋…</p>
      ) : empty && error !== null ? (
        <p role="alert" className="text-caption1 text-error">
          {error}
        </p>
      ) : empty ? (
        <div className="space-y-1">
          <p className="text-body text-text-primary">还没有登记跑鞋</p>
          <p className="text-caption1 text-text-muted">
            在活动详情里给跑步记录指定跑鞋后，这里会显示累计里程
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {shoes.map((shoe) => {
            const status = shoeStatus(shoe);
            const brandModel = [shoe.brand, shoe.model].filter(Boolean).join(" ");
            return (
              <li
                key={shoe.shoe_id}
                className="flex min-h-14 items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-body text-text-primary">{shoe.name}</p>
                  {brandModel === "" ? null : (
                    <p className="truncate text-caption1 text-text-muted">{brandModel}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-baseline gap-3">
                  <span className="flex items-baseline gap-1">
                    <span className="font-mono tabular-nums text-body text-text-primary">
                      {mileageKm(shoe)}
                    </span>
                    <span className="text-caption1 text-text-muted">km</span>
                  </span>
                  <span className={`text-caption1 ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
