"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { Bar } from "@shared/ui/MetricBar";
import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { Badge } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { useToast } from "@shared/ui/Toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";

interface Shoe {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  purchase_date: string | null;
  mileage_m: number;
  total_activities: number;
  last_used_at: string | null;
  retirement_alert: boolean;
  retired_at: string | null;
  notes: string | null;
}

interface ShoeDraft {
  name: string;
  brand: string;
  model: string;
  purchase_date: string;
  notes: string;
}

const EMPTY_DRAFT: ShoeDraft = { name: "", brand: "", model: "", purchase_date: "", notes: "" };

const RETIREMENT_KM = 800;

function lastUsedLabel(value: string | null): string {
  if (!value) return "未使用";
  const day = value.slice(0, 10);
  return day.replace(/-/g, "/");
}

function shoePayload(draft: ShoeDraft) {
  return {
    name: draft.name.trim(),
    brand: draft.brand.trim() || null,
    model: draft.model.trim() || null,
    purchase_date: draft.purchase_date || null,
    notes: draft.notes.trim() || null,
  };
}

export function ShoeManager() {
  const { mutate: globalMutate } = useSWRConfig();
  const { toast } = useToast();
  const { data: shoes = [], isLoading: loading, error: swrError, mutate } = useSWR<Shoe[]>(
    ["/gear/shoes"],
    () => apiFetch<Shoe[]>("/gear/shoes"),
  );
  const [draft, setDraft] = useState<ShoeDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState<Shoe | null>(null);
  const loadError = swrError ? apiErrorMessage(swrError, "无法读取跑鞋") : null;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const reload = () => {
    void mutate();
  };

  const createShoe = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await apiFetch<Shoe>("/gear/shoes", { method: "POST", body: JSON.stringify(shoePayload(draft)) });
      setDraft(EMPTY_DRAFT);
      setDialogOpen(false);
      toast("已添加跑鞋", "success");
      await invalidateDataCards(globalMutate);
    } catch (err: unknown) {
      setSubmitError(apiErrorMessage(err, "保存跑鞋失败"));
    } finally {
      setSaving(false);
    }
  };

  const retireShoe = async (shoe: Shoe) => {
    setActionError(null);
    setRetiringId(shoe.id);
    try {
      await apiFetch<void>(`/gear/shoes/${shoe.id}`, { method: "DELETE" });
      setConfirmRetire(null);
      toast(`「${shoe.name}」已标记退役`, "info");
      await invalidateDataCards(globalMutate);
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, "退役跑鞋失败"));
    } finally {
      setRetiringId(null);
    }
  };

  const activeShoes = shoes.filter((s) => !s.retired_at);
  const topShoe = [...activeShoes].sort((a, b) => b.mileage_m - a.mileage_m)[0] ?? null;
  const alertCount = activeShoes.filter((s) => s.retirement_alert).length;
  const summaryText = loading
    ? "正在读取跑鞋…"
    : loadError
      ? "读取失败，展开重试"
      : shoes.length === 0
        ? "尚未记录跑鞋 · 跑量按已关联跑步计算"
        : `${activeShoes.length} 双在役${topShoe ? ` · 主用 ${topShoe.name} (${(topShoe.mileage_m / 1000).toFixed(0)} km)` : ""}${alertCount > 0 ? ` · ${alertCount} 双建议更换` : ""}`;

  return (
    <>
      <DisclosureCard
        title="跑鞋与装备"
      summary={summaryText}
      badge={alertCount > 0 ? <Badge variant="warning">建议更换</Badge> : undefined}
      action={
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setSubmitError(null);
            setDialogOpen(true);
          }}
          disabled={retiringId !== null}
        >
          新增跑鞋
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-caption1 text-text-muted">记录鞋款与累计跑量；跑量按已关联的跑步活动计算。</p>
      {loading ? <p className="text-caption1 text-text-muted">正在读取跑鞋…</p> : loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-error/30 bg-error/5 p-3 text-error">
          <p className="text-caption1">{loadError}</p>
          <Button type="button" variant="outline" onClick={reload}>重新读取</Button>
        </div>
      ) : shoes.length === 0 ? (
        <p className="text-caption1 text-text-muted">尚未记录跑鞋</p>
      ) : (
        <ul className="space-y-3">
          {shoes.map((shoe) => (
            <li key={shoe.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-text-primary">{shoe.name}</p>
                  {shoe.retirement_alert && !shoe.retired_at ? <Badge variant="warning">建议更换</Badge> : null}
                  {shoe.retired_at ? <Badge variant="neutral">已退役</Badge> : null}
                </div>
                <p className="text-caption1 text-text-muted">{[shoe.brand, shoe.model].filter(Boolean).join(" · ") || "未填写品牌与型号"}</p>
                <p className="font-mono tabular-nums text-caption1 text-text-secondary">
                  {(shoe.mileage_m / 1000).toFixed(1)} / {RETIREMENT_KM} km · {shoe.total_activities} 次 · 最近 {lastUsedLabel(shoe.last_used_at)}
                </p>
                {shoe.purchase_date || shoe.notes ? (
                  <p className="text-caption1 text-text-muted">
                    {[shoe.purchase_date ? `购于 ${shoe.purchase_date}` : null, shoe.notes].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                <Bar value={shoe.mileage_m / 1000} max={RETIREMENT_KM} tone={shoe.retirement_alert ? "bg-warn" : "bg-primary"} className="mt-2" />
              </div>
              {!shoe.retired_at && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmRetire(shoe)}
                  disabled={retiringId !== null}
                >
                  {retiringId === shoe.id ? "处理中…" : "标记退役"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {actionError ? <p role="alert" className="text-caption1 text-error">{actionError}</p> : null}
      </div>
    </DisclosureCard>
    <Dialog
      open={dialogOpen}
        onOpenChange={(next) => {
          if (saving) return;
          setDialogOpen(next);
          if (!next) setSubmitError(null);
        }}
      >
        <DialogContent mobileSheet>
          <DialogHeader><DialogTitle>新增跑鞋</DialogTitle></DialogHeader>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => { event.preventDefault(); void createShoe(); }}
          >
            <label className="space-y-1.5 text-caption1 text-text-secondary" htmlFor="shoe-name">
              <span className="block">名称</span>
              <Input id="shoe-name" autoComplete="off" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={120} />
            </label>
            <label className="space-y-1.5 text-caption1 text-text-secondary" htmlFor="shoe-brand">
              <span className="block">品牌</span>
              <Input id="shoe-brand" autoComplete="off" value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} maxLength={80} />
            </label>
            <label className="space-y-1.5 text-caption1 text-text-secondary" htmlFor="shoe-model">
              <span className="block">型号</span>
              <Input id="shoe-model" autoComplete="off" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} maxLength={80} />
            </label>
            <label className="space-y-1.5 text-caption1 text-text-secondary" htmlFor="shoe-purchase-date">
              <span className="block">购买日期</span>
              <Input id="shoe-purchase-date" type="date" value={draft.purchase_date} onChange={(event) => setDraft({ ...draft, purchase_date: event.target.value })} />
            </label>
            <label className="space-y-1.5 text-caption1 text-text-secondary sm:col-span-2" htmlFor="shoe-notes">
              <span className="block">备注</span>
              <Input id="shoe-notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} maxLength={500} />
            </label>
            {submitError ? (
              <p role="alert" className="text-caption1 text-error sm:col-span-2">{submitError}</p>
            ) : null}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
              <Button type="submit" disabled={saving || !draft.name.trim()}>
                {saving ? "保存中…" : "添加跑鞋"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmRetire !== null}
        onOpenChange={(next) => { if (!next && retiringId === null) setConfirmRetire(null); }}
        title="确认退役这双跑鞋？"
        description={confirmRetire ? `「${confirmRetire.name}」标记退役后将保留历史里程，但不再参与后续活动关联。` : ""}
        confirmLabel="确认退役"
        confirmVariant="destructive"
        loading={retiringId !== null}
        onConfirm={() => { if (confirmRetire) void retireShoe(confirmRetire); }}
      />
    </>
  );
}
