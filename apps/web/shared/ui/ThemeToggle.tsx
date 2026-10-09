"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const THEME_STORAGE_KEY = "rm.theme";
const THEMES = ["light", "dark"] as const;
type ThemeName = (typeof THEMES)[number];

function isThemeName(value: string | null): value is ThemeName {
  return value === "light" || value === "dark";
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.classList.remove(...THEMES);
  document.documentElement.classList.add(theme);
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const nextTheme = isThemeName(storedTheme) ? storedTheme : "dark";
    applyTheme(nextTheme);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(nextTheme);
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-10 w-10 rounded-full" aria-hidden="true" />;
  }

  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  function handleToggle(): void {
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      className="focus-ring flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-all duration-150 hover:bg-surface-overlay hover:text-text-primary active:scale-90"
    >
      <span
        key={theme}
        className="block transition-transform duration-200 ease-out motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75"
      >
        {isDark ? (
          <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        ) : (
          <Sun className="h-[18px] w-[18px]" strokeWidth={1.8} />
        )}
      </span>
    </button>
  );
}
