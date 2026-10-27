import { Button } from "@shared/ui/button";
import { RefreshSpinner } from "./RefreshSpinner";

interface GoalCardActionsProps {
  refreshLoading: boolean;
  refreshError: string | null;
  onRefresh: () => void;
  onEdit: () => void;
  onAchieve: () => void;
  onAbandon: () => void;
}

/** 目标卡的操作行，以及紧贴其下的刷新失败提示。 */
export function GoalCardActions({
  refreshLoading,
  refreshError,
  onRefresh,
  onEdit,
  onAchieve,
  onAbandon,
}: GoalCardActionsProps) {
  return (
    <>
      <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" onClick={onRefresh} disabled={refreshLoading}>
          {refreshLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <RefreshSpinner />
              刷新中…
            </span>
          ) : (
            "刷新进度"
          )}
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          编辑
        </Button>
        <Button
          variant="secondary"
          onClick={onAchieve}
          className="border-success/30 text-success hover:bg-success/10"
        >
          标记达成
        </Button>
        <Button
          variant="ghost"
          onClick={onAbandon}
          aria-haspopup="dialog"
          data-testid="abandon-goal-trigger"
          className="ml-auto text-text-muted hover:text-error"
        >
          放弃
        </Button>
      </div>

      {refreshError && (
        <p className="mt-2 text-caption1 text-error">{refreshError}</p>
      )}
    </>
  );
}
