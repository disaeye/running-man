import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@shared/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-subheadline font-medium whitespace-nowrap transition-colors duration-200 ease-default outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-error aria-invalid:ring-error/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-accent text-on-accent hover:bg-accent/90 active:bg-primary-active",
        destructive:
          "border border-error/40 bg-error/10 text-error hover:bg-error/20 focus-visible:ring-error/20",
        outline:
          "border border-border-default bg-transparent text-text-primary hover:bg-surface-overlay",
        secondary:
          "border border-border-default bg-surface-card text-text-primary hover:bg-surface-active",
        ghost:
          "hover:bg-surface-overlay hover:text-text-primary",
        link: "text-accent-strong underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-[22px] py-[11px] min-h-[44px] min-w-[44px] has-[>svg]:px-4",
        xs: "h-8 gap-1 rounded-md px-2 text-caption1 min-h-[44px] min-w-[44px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-full px-4 min-h-[44px] min-w-[44px] has-[>svg]:px-3",
        lg: "h-12 rounded-full px-7 text-title3 font-light has-[>svg]:px-5",
        icon: "size-11 min-h-[44px] min-w-[44px] rounded-full",
        "icon-xs": "size-11 min-h-[44px] min-w-[44px] rounded-full [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-11 min-h-[44px] min-w-[44px] rounded-full",
        "icon-lg": "size-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
