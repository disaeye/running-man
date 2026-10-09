"use client";

import { useState } from "react";
import { Input } from "@shared/ui/input";
import { Switch } from "@shared/ui/Switch";
import { DateRangePicker } from "@shared/ui/DateRangePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { SectionHeader } from "@shared/ui/SectionHeader";

export function InputsGallery() {
  const [switchOn, setSwitchOn] = useState(true);
  const [dateFrom, setDateFrom] = useState("2026-01-01");
  const [dateTo, setDateTo] = useState("2026-07-19");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeader title="Input" subtitle="Default / Disabled / Error" />
        <div className="mt-4 flex flex-col gap-4 max-w-sm">
          <Input placeholder="Default input" />
          <Input placeholder="Disabled input" disabled />
          <Input aria-invalid placeholder="Error state" />
        </div>
      </div>

      <div>
        <SectionHeader title="Select" subtitle="Radix Select with items" />
        <div className="mt-4 max-w-xs">
          <Select defaultValue="run">
            <SelectTrigger>
              <SelectValue placeholder="选择运动类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="run">跑步</SelectItem>
              <SelectItem value="ride">骑行</SelectItem>
              <SelectItem value="swim">游泳</SelectItem>
              <SelectItem value="workout">健身</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <SectionHeader title="Switch" subtitle="On / Off / Disabled" />
        <div className="mt-4 flex flex-col gap-3 max-w-xs">
          <Switch label="通知推送" checked={switchOn} onChange={setSwitchOn} />
          <Switch label="关闭状态" checked={false} onChange={() => {}} />
          <Switch label="已禁用" checked={false} onChange={() => {}} disabled />
        </div>
      </div>

      <div>
        <SectionHeader title="DateRangePicker" subtitle="From/to + quick presets" />
        <div className="mt-4">
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
          />
        </div>
      </div>
    </div>
  );
}
