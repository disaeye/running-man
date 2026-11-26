"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@shared/lib/utils"
import { Button } from "@shared/ui/button"

function Dialog({
  open,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const restoreFocusRef = React.useRef<HTMLElement | null>(null)
  const wasOpenRef = React.useRef(false)
  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    if (!open && wasOpenRef.current) {
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
    }
    wasOpenRef.current = Boolean(open)
  }, [open])
  return <DialogPrimitive.Root data-slot="dialog" open={open} {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:duration-100 data-[state=closed]:ease-exit data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:ease-enter data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  mobileSheet = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** 手机上从底部升起的抽屉式呈现；sm 及以上恢复居中模态。 */
  mobileSheet?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed z-50 flex w-full flex-col overflow-hidden bg-surface-card p-0 shadow-elevated outline-none data-[state=closed]:animate-out data-[state=closed]:duration-100 data-[state=closed]:ease-exit data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:ease-enter data-[state=open]:fade-in-0",
          mobileSheet
            ? cn(
                /* 手机：贴底抽屉，顶部 24px 圆角，从底部升起 */
                "inset-x-0 bottom-0 max-h-[calc(100dvh-2rem)] translate-x-0 translate-y-0 rounded-t-3xl rounded-b-none border-t border-border-default data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
                /* sm 及以上：恢复居中模态，宽高同时受视口安全边界约束 */
                "sm:inset-x-auto sm:bottom-auto sm:top-[50%] sm:left-[50%] sm:w-[calc(100vw-2rem)] sm:max-h-[calc(100dvh-3rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:rounded-t-lg sm:rounded-b-lg sm:border sm:border-x sm:border-b sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:zoom-out-95 sm:max-w-lg",
              )
            : "top-[50%] left-[50%] w-[calc(100vw-2rem)] max-h-[calc(100dvh-3rem)] translate-x-[-50%] translate-y-[-50%] rounded-lg border border-border-default data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className
        )}
        {...props}
      >
        <div
          data-slot="dialog-body"
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain p-6",
            mobileSheet && "pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6",
          )}
        >
          <div className="flex flex-col gap-4">{children}</div>
        </div>
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="tactile absolute top-2 right-2 z-20 flex size-11 items-center justify-center rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">关闭</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 pr-10 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">关闭</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-headline leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-subheadline text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
