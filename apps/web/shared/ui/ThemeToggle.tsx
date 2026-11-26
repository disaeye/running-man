"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useTheme, type ThemeMode } from "@shared/lib/theme-provider";
import { SlidingIndicator } from "@shared/ui/SlidingIndicator";

const THEME_OPTIONS: readonly {
  readonly value: ThemeMode;
  readonly label: string;
  readonly Icon: typeof Moon;
}[] = [
  { value: "dark", label: "夜间遥测", Icon: Moon },
  { value: "light", label: "日光图谱", Icon: Sun },
  { value: "system", label: "跟随系统", Icon: Monitor },
];

/**
 * 紧凑双主题瞬切开关：默认隐藏内部状态依赖以防首屏水合闪烁，
 * 通过 CSS `.dark` 类名即时切换太阳/月亮图标，并把点击坐标传给 View Transition。
 */
export function ThemeToggle({ className }: { readonly className?: string }) {
  const { resolved, toggle } = useTheme();

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      aria-label="切换日间或夜间主题"
      title={`切换日间/夜间模式 (Alt+T · 当前${resolved === "dark" ? "夜间" : "日间"})`}
      onClick={(event) => {
        const origin =
          event.clientX === 0 && event.clientY === 0
            ? null
            : { clientX: event.clientX, clientY: event.clientY };
        toggle(origin);
      }}
      className={cn(
        "tactile focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border-default bg-surface-card text-text-secondary transition-colors hover:bg-surface-active hover:text-text-primary",
        className,
      )}
    >
      <Sun className="hidden size-4 dark:block" aria-hidden="true" />
      <Moon className="block size-4 dark:hidden" aria-hidden="true" />
    </button>
  );
}

/**
 * 三态界面外观选择器：夜间遥测 / 日光图谱 / 跟随系统。
 */
export function ThemeModeSelector({ className }: { readonly className?: string }) {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="界面外观模式"
      data-testid="theme-mode-selector"
      className={cn("relative flex rounded-full bg-surface-overlay p-1", className)}
    >
      <SlidingIndicator
        variant="accent-pill"
        options={THEME_OPTIONS.map((option) => ({
          key: option.value,
          selected: mode === option.value,
        }))}
      />
      {THEME_OPTIONS.map((option) => {
        const selected = mode === option.value;
        const Icon = option.Icon;
        return (
          <button
            key={option.value}
            type="button"
            data-indicator-key={option.value}
            aria-pressed={selected}
            onClick={(event) => {
              const origin =
                event.clientX === 0 && event.clientY === 0
                  ? null
                  : { clientX: event.clientX, clientY: event.clientY };
              setMode(option.value, origin);
            }}
            className={cn(
              "tactile focus-ring relative z-10 inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-caption1 font-medium transition-colors",
              selected ? "text-on-primary font-semibold" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
