import { AlertTriangle, CalendarPlus } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/Card";

/** A week with no planned sessions: one sentence, one action. */
export function EmptyWeek({ onGenerate }: { onGenerate: () => void }) {
  return (
    <Card padding="lg" data-testid="calendar-empty-week">
      <h2 className="text-body font-semibold text-text-primary">这一周还没有课表</h2>
      <p className="mt-2 max-w-xl text-subheadline leading-relaxed text-text-secondary">
        按目标日期倒推一份计划，生成后会填进这一周的每一天。
      </p>
      <Button onClick={onGenerate} className="mt-4 gap-1.5 rounded-full">
        <CalendarPlus className="size-4" aria-hidden="true" />
        <span>生成本周计划</span>
      </Button>
    </Card>
  );
}

/** The schedule could not be loaded: name the failure and offer the retry. */
export function PlanErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card padding="md" className="bg-error/5 text-center">
      <AlertTriangle className="mx-auto size-5 text-error" aria-hidden="true" />
      <p className="mt-2 text-subheadline font-medium text-error">课表加载失败</p>
      <p className="mt-1 text-caption1 text-text-secondary">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
        重新尝试
      </Button>
    </Card>
  );
}
