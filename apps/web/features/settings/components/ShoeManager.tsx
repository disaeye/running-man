"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { PageCard, Bar } from "@shared/ui/Lovable";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";

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
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [draft, setDraft] = useState<ShoeDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [retiringId, setRetiringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      try {
        const result = await apiFetch<Shoe[]>("/gear/shoes");
        if (!cancelled) setShoes(result);
      } catch (err: unknown) {
        if (!cancelled) setError(apiErrorMessage(err, "无法读取跑鞋"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }, []);

  const createShoe = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<Shoe>("/gear/shoes", { method: "POST", body: JSON.stringify(shoePayload(draft)) });
      setDraft(EMPTY_DRAFT);
      setDialogOpen(false);
      reload();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "保存跑鞋失败"));
    } finally {
      setSaving(false);
    }
  };

  const retireShoe = async (shoe: Shoe) => {
    setError(null);
    setRetiringId(shoe.id);
    try {
      await apiFetch<void>(`/gear/shoes/${shoe.id}`, { method: "DELETE" });
      reload();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "退役跑鞋失败"));
    } finally {
      setRetiringId(null);
    }
  };

  return (
    <PageCard className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption1 text-text-muted">记录鞋款与累计跑量；跑量按已关联的跑步活动计算。</p>
        <Button type="button" onClick={() => setDialogOpen(true)} disabled={retiringId !== null}>新增跑鞋</Button>
      </div>
      {loading ? <p className="text-caption1 text-text-muted">正在读取跑鞋…</p> : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-error/30 bg-error/5 p-3 text-error">
          <p className="text-caption1">{error}</p>
          <Button type="button" variant="outline" onClick={reload}>重新读取</Button>
        </div>
      ) : shoes.length === 0 ? (
        <p className="text-caption1 text-text-muted">尚未记录跑鞋</p>
      ) : (
        <ul className="space-y-3">
          {shoes.map((shoe) => (
            <li key={shoe.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
              <div>
                <p className="font-medium text-text-primary">{shoe.name}</p>
                <p className="text-caption1 text-text-muted">{[shoe.brand, shoe.model].filter(Boolean).join(" · ") || "未填写品牌与型号"}</p>
                <p className="font-mono text-caption1 text-text-secondary">{(shoe.mileage_m / 1000).toFixed(1)} / {RETIREMENT_KM} km{shoe.retired_at ? " · 已退役" : ""}</p>
                <p className="text-caption1 text-text-muted">{shoe.total_activities} 次 · 最近 {lastUsedLabel(shoe.last_used_at)}</p>
                <Bar value={shoe.mileage_m / 1000} max={RETIREMENT_KM} tone={shoe.retirement_alert ? "bg-warn" : "bg-primary"} className="mt-2" />
              </div>
              {!shoe.retired_at && (
                <Button
                  variant="outline"
                  onClick={() => void retireShoe(shoe)}
                  disabled={retiringId !== null}
                >
                  {retiringId === shoe.id ? "处理中…" : "标记退役"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && !loading ? <p role="alert" className="text-caption1 text-error">{error}</p> : null}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
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
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
              <Button type="submit" disabled={saving || !draft.name.trim()}>
                {saving ? "保存中…" : "添加跑鞋"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PageCard>
  );
}
