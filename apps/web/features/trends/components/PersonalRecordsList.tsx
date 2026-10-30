"use client";

import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";
import { formatDate } from "@shared/lib/format";

export function PersonalRecordsList() {
  const { data, loading, error } = usePersonalRecords();

  if (loading) return <Message>加载中...</Message>;
  if (error) return <Message className="text-error">{error}</Message>;
  if (data.length === 0) return <Message>{emptyGuidance()}</Message>;

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((record) => (
        <li
          key={`${record.sport}-${record.type}-${record.date}`}
          className="rounded-md border border-border-subtle bg-surface-base p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-subheadline font-medium text-text-secondary">{record.label}</span>
            <span className="text-caption1 text-text-muted">{formatDate(record.date)}</span>
          </div>
          <p className="mt-2 font-mono text-title1 font-semibold text-text-primary">
            {record.value_formatted}
          </p>
        </li>
      ))}
    </ul>
  );
}

function emptyGuidance(): string {
  return "暂无最佳成绩记录：同步包含 GPS 或比赛结果的跑步活动后会生成。";
}

function Message({
  className = "text-text-muted",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`flex min-h-32 items-center justify-center text-subheadline ${className}`}>{children}</div>;
}
