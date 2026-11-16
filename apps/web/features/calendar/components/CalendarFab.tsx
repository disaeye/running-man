"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Plus, Sparkles, X } from "lucide-react";

/**
 * 日历页的悬浮动作钮：三个高频动作（补录训练、生成计划、力量训练）收进拇指区。
 * 底部偏移量让 FAB 悬在移动 tab 栏上方，展开的菜单再向上生长。
 */
export function CalendarFab({ onAddAction, onGenerateAction }: {
  onAddAction: () => void;
  onGenerateAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-2">
      {open ? (
        <div role="menu" aria-label="训练操作" className="flex flex-col items-end gap-2">
          <Link
            href="/strength"
            role="menuitem"
            className="surface tactile flex min-h-11 items-center gap-2 rounded-full px-4 text-subheadline"
            onClick={() => setOpen(false)}
          >
            <CalendarPlus className="h-4 w-4 text-accent-strong" aria-hidden />
            力量训练
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onGenerateAction(); }}
            className="surface tactile flex min-h-11 items-center gap-2 rounded-full px-4 text-subheadline"
          >
            <Sparkles className="h-4 w-4 text-accent-strong" aria-hidden />
            生成计划
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onAddAction(); }}
            className="surface tactile flex min-h-11 items-center gap-2 rounded-full px-4 text-subheadline"
          >
            <Plus className="h-4 w-4 text-accent-strong" aria-hidden />
            记录训练
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "收起训练操作" : "展开训练操作"}
        onClick={() => setOpen((value) => !value)}
        className={`tactile flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-panel transition-transform duration-150 ${open ? "rotate-45" : ""}`}
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <Plus className="h-6 w-6" aria-hidden />}
      </button>
    </div>
  );
}
