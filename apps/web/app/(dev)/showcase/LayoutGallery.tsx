"use client";

import { useState } from "react";
import { PageHeader } from "@shared/ui/PageHeader";
import { ReadingStrip } from "@shared/ui/ReadingStrip";
import { Segmented } from "@shared/ui/SegmentedControl";
import { MiniSparkline } from "@shared/ui/MiniSparkline";
import { ZoneMeter } from "@shared/ui/ZoneMeter";
import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/Card";
import { ShowcaseHeading } from "./ShowcaseHeading";

const SPARK_DATA = [40, 55, 48, 62, 58, 70, 65, 72, 68, 80];

export function LayoutGallery() {
  const [segment, setSegment] = useState("run");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <ShowcaseHeading title="PageHeader" subtitle="Title + meta + description + action" />
        <div className="mt-4">
          <PageHeader
            meta="本周总结 · 11/13–11/19"
            title="活动列表"
            description="管理所有运动记录"
            action={<Button size="sm" variant="outline">查看全部</Button>}
          >
            <ReadingStrip
              items={[
                { label: "距离", value: "48.2", unit: "km" },
                { label: "CTL 体能", value: "54", termKey: "CTL" },
                { label: "TSB 状态", value: "+4", termKey: "TSB" },
                { label: "静息心率", value: null, unit: "bpm" },
              ]}
            />
          </PageHeader>
        </div>
      </div>

      <div>
        <ShowcaseHeading title="Segmented" subtitle="Sliding pill selector" />
        <div className="mt-4 max-w-md">
          <Segmented
            value={segment}
            options={[
              { value: "run", label: "跑步" },
              { value: "strength", label: "力量" },
              { value: "all", label: "全部" },
            ]}
            onChange={setSegment}
          />
        </div>
      </div>

      <div>
        <ShowcaseHeading title="DisclosureCard" subtitle="Progressive disclosure card" />
        <div className="mt-4 max-w-lg">
          <DisclosureCard title="负荷 × 恢复对照" summary="点击展开详细指标说明与衍生图表">
            <p className="text-subheadline text-text-secondary">二层明晰内容与来源说明。</p>
          </DisclosureCard>
        </div>
      </div>

      <div>
        <ShowcaseHeading title="MiniSparkline & ZoneMeter" subtitle="Contract-driven zone indicator" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card padding="sm">
            <p className="mb-2 text-caption1 text-text-muted">MiniSparkline</p>
            <MiniSparkline values={SPARK_DATA} strokeColor="var(--color-fitness)" height={36} width={140} />
          </Card>
          <Card padding="sm">
            <p className="mb-2 text-caption1 text-text-muted">ZoneMeter (TSB)</p>
            <ZoneMeter metricKey="tsb" value={4} />
          </Card>
        </div>
      </div>
    </div>
  );
}
