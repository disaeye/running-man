"use client";

import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { RingStat } from "@shared/ui/RingStat";

/**
 * 本周卡：左边一圈负荷完成度，右边四个数字把这一周说清。
 *
 * 环给的是「计划负荷做了多少」，剩下四行给的是这一周的其他口径：
 * 跑了多远、爬了多少、还欠多少、已经练了几次。四行都是 12px 标签配 15px 等宽数值，
 * 上下对齐，扫一眼就能比。
 *
 * 缺值写「未记录」，不写 0：计划还没排出来和计划是 0 TSS，是两件事。
 */

const UNRECORDED = "未记录";

interface Props {
  readonly plannedTss: number | null;
  readonly actualTss: number | null;
  readonly distanceM: number | null;
  readonly elevationM: number | null;
  readonly sessions: number | null;
  /** 周序号，写在标题右端。 */
  readonly weekLabel: string;
  /** 本周还差的计划负荷。 */
  readonly remainingTss: number | null;
}

function row(label: string, value: string, unit: string) {
  return (
    <div key={label} className="flex items-baseline justify-between gap-3">
      <span className="text-caption1 text-text-muted">{label}</span>
      <span className="font-mono tabular-nums text-body text-text-primary">
        {value}
        <span className="ml-1 text-caption1 text-text-muted">{unit}</span>
      </span>
    </div>
  );
}

export function WeekCard({
  plannedTss,
  actualTss,
  distanceM,
  elevationM,
  sessions,
  weekLabel,
  remainingTss,
}: Props) {
  const rows = [
    row("里程", distanceM == null ? UNRECORDED : (distanceM / 1000).toFixed(1), "km"),
    row("累计爬升", elevationM == null ? UNRECORDED : String(Math.round(elevationM)), "m"),
    row("剩余计划", remainingTss == null ? UNRECORDED : String(Math.round(remainingTss)), "TSS"),
    row("已训练", sessions == null ? UNRECORDED : String(sessions), "次"),
  ];

  return (
    <Card data-testid="home-weekly-horizon">
      <CardHeader
        title="本周"
        trailing={<span className="tabular-nums text-caption1 text-text-muted">{weekLabel}</span>}
      />

      <div className="flex items-center gap-6">
        <RingStat
          value={actualTss ?? 0}
          max={plannedTss ?? 0}
          label="负荷"
          caption="TSS"
          size={96}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">{rows}</div>
      </div>
    </Card>
  );
}
