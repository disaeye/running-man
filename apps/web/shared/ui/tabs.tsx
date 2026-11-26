"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@shared/lib/utils"
import { SlidingIndicator } from "@shared/ui/SlidingIndicator"

/** 当前选中的 value，供 TabsList 决定指示条停在哪一项；非受控时取 defaultValue。 */
const TabsValueContext = React.createContext<string | undefined>(undefined)

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const { value, defaultValue, ...rootProps } = props
  return (
    <TabsValueContext.Provider value={value ?? defaultValue}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        value={value}
        defaultValue={defaultValue}
        className={cn(
          "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
          className
        )}
        {...rootProps}
      />
    </TabsValueContext.Provider>
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative flex w-full items-center justify-center rounded-2xl p-1 text-text-muted group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:w-auto group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none sm:inline-flex sm:w-fit",
  {
    variants: {
      variant: {
        default: "bg-surface-overlay",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const active = React.useContext(TabsValueContext)
  const options = React.Children.toArray(children).map((child) => {
    if (!React.isValidElement<{ value?: string }>(child)) {
      throw new Error("TabsList 的直接子元素必须是带 value 的 TabsTrigger")
    }
    const key = child.props.value
    if (key == null) {
      throw new Error("TabsTrigger 缺少 value，指示条无法定位")
    }
    return { key, selected: key === active }
  })

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      <SlidingIndicator variant={variant === "line" ? "underline" : "surface-pill"} options={options} />
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-indicator-key={props.value}
      className={cn(
        "relative inline-flex min-h-[44px] h-full min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-subheadline font-medium whitespace-nowrap text-text-secondary transition-colors duration-fast group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-text-primary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-[state=active]:text-text-primary",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
