"use client";

import { useEffect, type ReactNode } from "react";

/**
 * The app has one theme: the dark "night track" palette. The class is set on
 * the document element so the `.dark` selectors and the `:root` variables
 * agree; both declare the same values.
 */
const THEME_CLASS = "dark";

export function Providers({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add(THEME_CLASS);
  }, []);

  return children;
}
