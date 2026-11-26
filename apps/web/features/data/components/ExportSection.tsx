"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { apiDownloadUrl, apiErrorMessage, apiFetch } from "@shared/lib/api";
import { athleteToday, useAthleteTimezone } from "@shared/lib/training-day";

interface CalendarEvent {
  event_id: string;
  name: string | null;
  status?: string | null;
}

function addDays(day: string, offset: number): string {
  const dt = new Date(`${day}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

export function ExportSection() {
  const timezone = useAthleteTimezone();
  const today = athleteToday(timezone);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  const from = fromOverride ?? yearStart;
  const to = toOverride ?? today;
  const futureEnd = addDays(today, 90);
  const [selectedEventId, setSelectedEventId] = useState("");
  const { data: rawEvents, error: eventsError } = useSWR<CalendarEvent[]>(
    ["/calendar", { from: yearStart, to: futureEnd }],
    () => apiFetch<CalendarEvent[]>("/calendar", { params: { from: yearStart, to: futureEnd } }),
  );
  const events = (rawEvents ?? []).filter((ev) => ev.status !== "deleted");
  const error = eventsError ? apiErrorMessage(eventsError) : null;

  const invalidRange = Boolean(from && to && from > to);

  const handleCsvExport = () => {
    if (!from || !to || invalidRange) return;
    window.open(apiDownloadUrl("/export/activities.csv", { from, to }));
  };

  const handleZwoExport = () => {
    if (!selectedEventId) return;
    window.open(apiDownloadUrl("/export/workout.zwo", { event_id: selectedEventId }));
  };

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">活动与课表数据导出</h2>
        <p className="text-xs text-muted-foreground">
          支持将历史训练活动导出为标准 CSV 表格，或导出 ZWO 训练课表文件
        </p>
        {/* CSV Export */}
        <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-base p-4">
          <h3 className="text-subheadline font-medium text-text-primary">活动数据 (CSV)</h3>
          <div className="flex flex-wrap items-end gap-3">
            <DateField label="开始" value={from} onChange={setFromOverride} />
            <DateField label="结束" value={to} onChange={setToOverride} />
            <Button onClick={handleCsvExport} disabled={!from || !to || invalidRange}>
              导出 CSV
            </Button>
          </div>
          {invalidRange ? (
            <p role="alert" className="text-caption1 text-error">
              开始日期不能晚于结束日期
            </p>
          ) : null}
        </div>

        {/* ZWO Export */}
        <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-base p-4">
          <h3 className="text-subheadline font-medium text-text-primary">训练计划 (ZWO)</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-32">
              <label className="text-caption1 font-medium text-text-secondary">选择训练计划</label>
              <select
                aria-label="选择训练计划"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="min-h-[44px] rounded-md border border-border-subtle bg-surface-overlay px-3 py-1.5 text-subheadline text-text-primary focus-ring"
              >
                <option value="">选择计划…</option>
                {events.map((ev) => (
                  <option key={ev.event_id} value={ev.event_id}>
                    {ev.name ?? ev.event_id}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" onClick={handleZwoExport} disabled={!selectedEventId}>
              导出 ZWO
            </Button>
          </div>
          {error && <p className="text-caption1 text-error">{error}</p>}
        </div>
      </div>
    </Card>
  );
}

function DateField({ label, value, onChange }: { readonly label: string; readonly value: string; readonly onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-caption1 font-medium text-text-secondary">{label}</label>
      <input
        aria-label={label}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] rounded-md border border-border-subtle bg-surface-overlay px-3 py-1.5 text-subheadline text-text-primary focus-ring"
      />
    </div>
  );
}
