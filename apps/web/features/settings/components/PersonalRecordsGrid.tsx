"use client";

import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { Badge } from "@shared/ui/Badge";
import { InsetBlock } from "@shared/ui/InsetBlock";
import { formatDate } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";

const UNRECORDED = "未记录";

/**
 * 四格成绩对应的接口 `type`。
 *
 * 跑步纪录的 type 是 `fastest_{距离}m`（`domain/insights/prs.py` 的
 * RUN_DISTANCES_M 与 `presentation/api/insights_helpers.py` 拼出来的），
 * 不是 `fastest_5k` 那种写法；1 公里的纪录存在但这里不占格。
 */
const DISTANCE_CELLS = [
  { label: "5K", type: "fastest_5000m" },
  { label: "10K", type: "fastest_10000m" },
  { label: "半马", type: "fastest_21097m" },
  { label: "全马", type: "fastest_42195m" },
] as const;

/**
 * 档案页的个人最好成绩：四个标准距离各占一格。
 *
 * 只取跑步（`family === "running"`，别名写法由 registry 归一），骑行功率纪录
 * 不在这里。数值是接口给的格式化结果，本地不再重算配速。
 */
export function PersonalRecordsGrid() {
  const { data } = usePersonalRecords();
  const runRecords = data.filter(
    (record) => getSportConfig(record.sport).family === "running",
  );

  return (
    <Card padding="md" data-testid="personal-records-grid">
      <CardHeader title="个人最好成绩" trailing={<Badge>估算</Badge>} />

      <div className="grid grid-cols-2 gap-3">
        {DISTANCE_CELLS.map((cell) => {
          const record = runRecords.find((row) => row.type === cell.type) ?? null;
          return (
            <InsetBlock key={cell.type}>
              <p className="text-caption1 text-text-muted">{cell.label}</p>
              {record === null ? (
                <p className="mt-1 text-caption1 text-text-muted">{UNRECORDED}</p>
              ) : (
                <>
                  <p className="mt-1 font-mono text-title2 font-semibold tabular-nums text-text-primary">
                    {record.value_formatted}
                  </p>
                  <p className="mt-1 text-caption1 text-text-muted">
                    {formatDate(record.date)}
                  </p>
                </>
              )}
            </InsetBlock>
          );
        })}
      </div>

      <p className="mt-3 text-caption1 text-text-muted">
        取自训练记录按均速外推，不是比赛实测成绩
      </p>
    </Card>
  );
}
