import { Check, X } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { SectionHeader } from "@shared/ui/SectionHeader";

export interface AvailabilityRow {
  label: string;
  ok: boolean;
}

export function DataAvailabilityCard({
  rows,
  source,
  fileType,
}: {
  rows: AvailabilityRow[];
  source: string;
  fileType: string;
}) {
  return (
    <Card padding="md" data-testid="data-availability-card">
      <SectionHeader
        title="数据可用性"
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {source && (
              <span className="inline-flex items-center rounded-full bg-surface-overlay px-2.5 py-0.5 text-caption2 text-text-secondary">
                {source}
              </span>
            )}
            {fileType && (
              <span className="inline-flex items-center rounded-full bg-surface-overlay px-2.5 py-0.5 font-mono text-caption2 uppercase text-text-secondary">
                {fileType}
              </span>
            )}
          </div>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map((m) => (
          <span
            key={m.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption1 font-medium ${
              m.ok
                ? "bg-success/10 text-success"
                : "bg-surface-overlay text-text-muted"
            }`}
            data-testid={`availability-${m.label}`}
            data-state={m.ok ? "available" : "missing"}
          >
            <span aria-hidden>
              {m.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </span>
            {m.label}
          </span>
        ))}
      </div>
    </Card>
  );
}
