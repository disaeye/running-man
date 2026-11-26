"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { normalizeCssColor } from "@shared/lib/chart-tokens";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "rm.theme";

interface ThemeOrigin {
  readonly clientX: number;
  readonly clientY: number;
}

interface ThemeState {
  readonly mode: ThemeMode;
  readonly resolved: ResolvedTheme;
}

interface ThemeContextValue extends ThemeState {
  readonly setMode: (next: ThemeMode, origin?: ThemeOrigin | null) => void;
  readonly toggle: (origin?: ThemeOrigin | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore storage access issues
  }
  return "dark";
}

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

function computeResolved(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? resolveSystemTheme() : mode;
}

function syncMetaThemeColor(): void {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-surface-sunken")
    .trim();
  const normalized = normalizeCssColor(bg);
  if (normalized) meta.content = normalized;
}

function applyThemeToDom(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  syncMetaThemeColor();
}

function supportsRadialTransition(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (typeof document.startViewTransition !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<ThemeState>({ mode: "dark", resolved: "dark" });

  useEffect(() => {
    const initialMode = readStoredMode();
    const initialResolved = computeResolved(initialMode);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ mode: initialMode, resolved: initialResolved });
    applyThemeToDom(initialResolved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (readStoredMode() !== "system") return;
      const nextResolved = resolveSystemTheme();
      setState({ mode: "system", resolved: nextResolved });
      applyThemeToDom(nextResolved);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const nextMode = readStoredMode();
      const nextResolved = computeResolved(nextMode);
      setState({ mode: nextMode, resolved: nextResolved });
      applyThemeToDom(nextResolved);
    };
    mq.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setMode = useCallback(
    (nextMode: ThemeMode, origin?: ThemeOrigin | null) => {
      const nextResolved = computeResolved(nextMode);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
      } catch {
        // ignore storage errors
      }

      const commit = () => {
        setState({ mode: nextMode, resolved: nextResolved });
        applyThemeToDom(nextResolved);
      };

      if (!supportsRadialTransition() || nextResolved === state.resolved) {
        commit();
        return;
      }

      const root = document.documentElement;
      root.dataset.themeSwitching = "true";
      root.dataset.themeVt = "true";
      const x = origin?.clientX ?? window.innerWidth / 2;
      const y = origin?.clientY ?? window.innerHeight / 2;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );

      try {
        const vt = document.startViewTransition(() => {
          commit();
        });
        void vt.ready
          .then(() => {
            document.documentElement.animate(
              {
                clipPath: [
                  `circle(0px at ${x}px ${y}px)`,
                  `circle(${endRadius}px at ${x}px ${y}px)`,
                ],
              },
              {
                duration: 280,
                easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                pseudoElement: "::view-transition-new(root)",
              },
            );
          })
          .catch(() => undefined);
        void vt.finished
          .finally(() => {
            delete root.dataset.themeSwitching;
            delete root.dataset.themeVt;
          })
          .catch(() => undefined);
      } catch {
        delete root.dataset.themeSwitching;
        delete root.dataset.themeVt;
        commit();
      }
    },
    [state.resolved],
  );

  const toggle = useCallback(
    (origin?: ThemeOrigin | null) => {
      const next: ThemeMode = state.resolved === "dark" ? "light" : "dark";
      setMode(next, origin);
    },
    [state.resolved, setMode],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "t" || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode: state.mode, resolved: state.resolved, setMode, toggle }),
    [state.mode, state.resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      mode: "dark",
      resolved: "dark",
      setMode: () => undefined,
      toggle: () => undefined,
    };
  }
  return ctx;
}
