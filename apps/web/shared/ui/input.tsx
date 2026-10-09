import * as React from "react"

import { cn } from "@shared/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-border-default bg-surface-card px-3 py-1 text-callout transition-colors duration-fast outline-none selection:bg-accent selection:text-on-accent file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-subheadline file:font-medium file:text-text-primary placeholder:text-text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-subheadline",
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
        "aria-invalid:border-error aria-invalid:ring-error/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
