"use client";

import { SectionHeader } from "@shared/ui/SectionHeader";
import { ListRow } from "@shared/ui/ListRow";
import { PageHeader } from "@shared/ui/PageHeader";
import { Avatar } from "@shared/ui/Avatar";
import { Sparkline } from "@shared/ui/Sparkline";
import { ZoneScale, type ZoneBand } from "@shared/ui/ZoneScale";
import { Badge } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/Card";

const HR_ZONES: ZoneBand[] = [
  { min: 100, max: 130, tone: "safe", label: "Zone 1-2" },
  { min: 130, max: 155, tone: "caution", label: "Zone 3" },
  { min: 155, max: 190, tone: "danger", label: "Zone 4-5" },
];

const SPARK_DATA = [40, 55, 48, 62, 58, 70, 65, 72, 68, 80];

export function LayoutGallery() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeader title="PageHeader" subtitle="Title + description + action" />
        <div className="mt-4 flex flex-col gap-4">
          <PageHeader title="训练概览" description="最近 7 天数据汇总" />
          <PageHeader
            title="活动列表"
            description="管理所有运动记录"
            action={<Button size="sm" variant="outline">查看全部</Button>}
          />
        </div>
      </div>

      <div>
        <SectionHeader title="SectionHeader" subtitle="With optional action slot" />
        <div className="mt-4 flex flex-col gap-6">
          <SectionHeader title="训练概览" subtitle="最近 7 天" />
          <SectionHeader
            title="活动列表"
            action={<Button size="sm" variant="outline">查看全部</Button>}
          />
        </div>
      </div>

      <div>
        <SectionHeader title="ListRow" subtitle="With chevron / trailing / disabled" />
        <div className="mt-4 flex flex-col gap-1">
          <ListRow label="账户设置" description="管理个人信息和偏好" chevron onClick={() => {}} />
          <ListRow label="数据源" trailing={<Badge variant="success">已连接</Badge>} chevron onClick={() => {}} />
          <ListRow label="版本" trailing={<span className="text-text-muted">1.0.0</span>} onClick={() => {}} />
          <ListRow label="已禁用" description="此选项当前不可用" disabled onClick={() => {}} />
        </div>
      </div>

      <div>
        <SectionHeader title="Avatar" subtitle="SM / MD / LG + image fallback" />
        <div className="mt-4 flex items-center gap-4">
          <Avatar name="Alice" size="sm" />
          <Avatar name="Bob" size="md" />
          <Avatar name="Charlie" size="lg" />
        </div>
      </div>

      <div>
        <SectionHeader title="Sparkline" subtitle="Area / Line / Bar variants" />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Card padding="sm">
            <p className="text-caption1 text-text-muted mb-2">Area</p>
            <Sparkline data={SPARK_DATA} variant="area" height={40} />
          </Card>
          <Card padding="sm">
            <p className="text-caption1 text-text-muted mb-2">Line</p>
            <Sparkline data={SPARK_DATA} variant="line" height={40} />
          </Card>
          <Card padding="sm">
            <p className="text-caption1 text-text-muted mb-2">Bar</p>
            <Sparkline data={SPARK_DATA} variant="bar" height={40} />
          </Card>
        </div>
      </div>

      <div>
        <SectionHeader title="ZoneScale" subtitle="HR zones with value marker" />
        <div className="mt-4 max-w-md">
          <ZoneScale zones={HR_ZONES} value={145} displayMin={100} displayMax={190} />
        </div>
      </div>
    </div>
  );
}
