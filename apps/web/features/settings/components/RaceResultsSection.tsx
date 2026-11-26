"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/Badge";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { useToast } from "@shared/ui/Toast";
import { apiErrorMessage } from "@shared/lib/api";
import { eventLabel } from "@features/today/lib/grade-label";
import { useRaceResults } from "@features/settings/hooks/useRaceResults";
import { formatRaceTime } from "@features/settings/lib/race-time";
import { RaceResultForm } from "@features/settings/components/RaceResultForm";

/**
 * 比赛成绩的列表与录入入口。
 *
 * 这张卡是等级评定的数据来源，所以它同时承担两件事：让运动员看见系统手上
 * 有哪些成绩，以及让「没有成绩」这件事有下一步——空态写的不是「暂无数据」，
 * 而是登记之后才会出现等级。
 */
export function RaceResultsSection() {
  const { toast } = useToast();
  const { data, loading, error, create, remove, reload } = useRaceResults();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState<{ id: string; name: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteRow = async (id: string) => {
    setRemovingId(id);
    setDeleteError(null);
    try {
      await remove(id);
      setConfirmRow(null);
      toast("比赛成绩已删除", "info");
    } catch (caught) {
      setDeleteError(apiErrorMessage(caught, "删除比赛成绩失败，请稍后重试。"));
    } finally {
      setRemovingId(null);
    }
  };

  const [open, setOpen] = useState(false);
  const latest = data[0] ?? null;
  const summaryText = loading
    ? "正在读取比赛成绩…"
    : error !== null
      ? "读取失败，展开重试"
      : data.length === 0
        ? "还没有比赛成绩 · 登记后计算大众选手等级"
        : `共 ${data.length} 条 · 最近 ${latest ? `${latest.event_name} ${formatRaceTime(latest.time_s)}` : ""}`;

  return (
    <DisclosureCard
      title="比赛成绩"
      summary={summaryText}
      open={open || formOpen}
      onOpenChange={setOpen}
      testId="race-results-section"
      action={
        formOpen ? undefined : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(true);
              setFormOpen(true);
            }}
          >
            添加成绩
          </Button>
        )
      }
    >

      {loading && (
        <p className="flex items-center gap-2 text-caption1 text-text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          正在读取比赛成绩…
        </p>
      )}

      {!loading && error !== null && (
        <div className="space-y-2">
          <p role="alert" className="text-caption1 text-error">
            {error}
          </p>
          <button
            type="button"
            onClick={reload}
            className="focus-ring text-caption1 text-accent-strong underline underline-offset-2"
          >
            重新读取
          </button>
        </div>
      )}

      {!loading && error === null && data.length === 0 && (
        <div className="space-y-1">
          <p className="text-body text-text-primary">还没有比赛成绩</p>
          <p className="text-caption1 text-text-muted">
            登记一次真实比赛成绩后才能计算大众选手等级与年龄分级
          </p>
        </div>
      )}

      {data.length > 0 && (
        <ul className="divide-y divide-border-subtle">
          {data.map((row) => (
            <li
              key={row.id}
              className="flex min-h-14 items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-body text-text-primary">
                    {row.event_name}
                  </p>
                  {row.a1_certified ? <Badge variant="info">A1 认证</Badge> : null}
                </div>
                <p className="truncate text-caption1 text-text-muted font-mono tabular-nums">
                  {eventLabel(row.distance_category)} · {row.race_date}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono tabular-nums text-body text-text-primary">
                  {formatRaceTime(row.time_s)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmRow({ id: row.id, name: row.event_name });
                  }}
                  disabled={removingId !== null}
                  aria-label={`删除 ${row.event_name}`}
                  className="focus-ring grid size-11 place-items-center rounded-full text-text-muted transition-colors hover:text-error disabled:opacity-50"
                >
                  {removingId === row.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteError !== null && (
        <p role="alert" className="mt-2 text-caption1 text-error">
          {deleteError}
        </p>
      )}

      {formOpen && (
        <RaceResultForm
          onSubmit={async (draft) => {
            await create(draft);
            setFormOpen(false);
          }}
          onCancel={() => setFormOpen(false)}
        />
      )}
      <ConfirmDialog
        open={confirmRow !== null}
        onOpenChange={(next) => { if (!next && removingId === null) setConfirmRow(null); }}
        title="确认删除这条比赛成绩？"
        description={confirmRow ? `删除「${confirmRow.name}」后将重新计算大众选手等级，且不可恢复。` : ""}
        confirmLabel="确认删除"
        confirmVariant="destructive"
        loading={removingId !== null}
        onConfirm={() => { if (confirmRow) void deleteRow(confirmRow.id); }}
      />
    </DisclosureCard>
  );
}
