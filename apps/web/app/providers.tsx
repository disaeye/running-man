"use client";

import { useEffect, type ReactNode } from "react";

const THEME_STORAGE_KEY = "rm.theme";
const THEMES = ["light", "dark"] as const;
type ThemeName = (typeof THEMES)[number];

function isThemeName(value: string | null): value is ThemeName {
  return value === "light" || value === "dark";
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.classList.remove(...THEMES);
  document.documentElement.classList.add(theme);
}

export function Providers({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const theme = isThemeName(storedTheme) ? storedTheme : "dark";
    applyTheme(theme);
    if (!isThemeName(storedTheme)) window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, []);

  return children;
}
