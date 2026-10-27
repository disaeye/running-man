"use client";

import { useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { NumberPair } from "@shared/ui/NumberPair";
import { zoneFor, type ZoneTone } from "@shared/lib/metric-zone";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useReadiness } from "@features/today/hooks/useReadiness";

/** 与首页读数同一个 42 天窗口，两处不会各自取一段历史。 */
const WINDOW_DAYS = 42;

const UNRECORDED = "未记录";
/**
 * 就绪分数在样本不足时是中点值，不是测量结果。
 * 印数字等于把一个占位值当成读数，所以这里换成一个说明。
 */
const PENDING_BASELINE = "待建立基线";

/**
 * 分区语气到文字色的映射。
 *
 * 分档本身只在 `contracts/v1/metrics.yaml` 里定义一次，这里只管上色：
 * 状态词和下面那句说明都来自同一个 zone，改阈值时两处不会说相反的话。
 */
const TONE_TEXT_CLASS: Readonly<Record<ZoneTone, string>> = {
  safe: "text-success",
  caution: "text-warning",
  danger: "text-error",
  neutral: "text-text-muted",
};

/** 窗口里最后一点的 ACWR。空值代表历史不足，不折算成 0。 */
function latestAcwr(points: ReadonlyArray<{ readonly acwr: number | null }>): number | null {
  return points.at(-1)?.acwr ?? null;
}

/**
 * 档案页的训练分区：负荷 + 就绪两个读数，加上一句对负荷变化的判断。
 *
 * 只读。这里不给建议、不给调整入口——训练决定的入口在首页，
 * 这张卡负责让运动员看见「现在处于什么状态」。
 */
export function LoadRiskCard() {
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(WINDOW_DAYS, timezone), [timezone]);
  const pmc = usePmcData(range.from, range.to);
  const readiness = useReadiness();

  const acwr = latestAcwr(pmc.data);
  const local = readiness.data?.local_readiness ?? null;
  // data_sufficient 为假时 score 是中点占位值，不能当读数。
  const readinessScore =
    local !== null && local.data_sufficient ? Math.round(local.score) : null;
  const readinessPending = local !== null && !local.data_sufficient;
  const zone = zoneFor("acwr", acwr);

  return (
    <Card padding="md" data-testid="load-risk-card">
      <CardHeader
        title="负荷与风险"
        trailing={
          zone === null ? undefined : (
            <span className={`text-caption1 font-medium ${TONE_TEXT_CLASS[zone.tone]}`}>
              {zone.label}
            </span>
          )
        }
      />

      <NumberPair
        left={{
          label: "ACWR",
          value: acwr === null ? UNRECORDED : acwr.toFixed(1),
        }}
        right={
          readinessScore !== null
            ? { label: "就绪", value: String(readinessScore), unit: "分" }
            : {
                label: "就绪",
                value: readinessPending ? PENDING_BASELINE : UNRECORDED,
              }
        }
      />

      {zone === null ? null : (
        <p className="mt-3 text-caption1 text-text-muted">{zone.description}</p>
      )}
    </Card>
  );
}
