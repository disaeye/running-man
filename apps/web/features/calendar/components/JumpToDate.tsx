"use client";

import { useState } from "react";
import { CalendarSearch } from "lucide-react";

/**
 * 「跳到日期」：原生日期输入放在弹出面板里，确认后把完整日期交给调用方。
 * 面板外的点击与 Esc 都收起；输入为空时不触发。
 */
export function JumpToDate({ onJump }: { onJump: (day: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const confirm = () => {
    if (!value) return;
    onJump(value);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="跳到日期"
        data-testid="jump-to-date"
        onClick={() => setOpen((prev) => !prev)}
        className="tactile flex h-11 items-center gap-1 rounded-full px-2 text-caption1 text-text-muted hover:bg-secondary"
      >
        <CalendarSearch className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">跳到</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-20 flex items-center gap-2 rounded-xl border border-border-default bg-surface-card p-3 shadow-elevated">
          <input
            type="date"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter") confirm();
            }}
            className="min-h-11 rounded-lg border border-border-default bg-surface-card px-2 text-subheadline"
            aria-label="选择日期"
          />
          <button
            type="button"
            onClick={confirm}
            className="tactile min-h-11 rounded-full bg-primary px-3 text-caption1 text-primary-foreground"
          >
            前往
          </button>
        </div>
      ) : null}
    </div>
  );
}
