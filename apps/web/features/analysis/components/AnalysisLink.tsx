// Shared Next.js Link + design-system Button composition used by Analysis
// empty states and overview cards. Encapsulates the asChild + Slot pattern so
// callers don't remember the link-visual-on-button dance.

import type { ReactNode } from "react";
import Link from "next/link";
import { Button, type buttonVariants } from "@shared/ui/button";
import type { VariantProps } from "class-variance-authority";

type LinkButtonProps = {
  readonly href: string;
  readonly children: ReactNode;
} & VariantProps<typeof buttonVariants>;

export function LinkButton({ href, children, ...variantProps }: LinkButtonProps) {
  return (
    <Button asChild {...variantProps}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
