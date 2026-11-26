"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@shared/lib/theme-provider";

export function Providers({ children }: { readonly children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
