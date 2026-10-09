"use client";

import { useEffect, useState } from "react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { apiDownloadUrl, apiErrorMessage, apiFetch } from "@shared/lib/api";

interface CalendarEvent {
  event_id: string;
  name: string | null;
}

export function ExportSection() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const end = today.toISOString().slice(0, 10);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrom(start);
    setTo(end);

    apiFetch<CalendarEvent[]>("/calendar", { params: { from: start, to: end } })
      .then(setEvents)
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, []);

  const handleCsvExport = () => {
    if (!from || !to) return;
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
            <DateField label="开始" value={from} onChange={setFrom} />
            <DateField label="结束" value={to} onChange={setTo} />
            <Button onClick={handleCsvExport} disabled={!from || !to}>
              导出 CSV
            </Button>
          </div>
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
