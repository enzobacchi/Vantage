"use client"

import * as React from "react"
import type { Icon } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type SettingsNavItem = {
  id: string
  label: string
  icon: Icon
}

type SettingsNavProps = {
  items: SettingsNavItem[]
  value: string
  onValueChange: (id: string) => void
  className?: string
}

export function SettingsNav({ items, value, onValueChange, className }: SettingsNavProps) {
  return (
    <nav className={cn("flex flex-col gap-0.5", className)}>
      {items.map((item) => {
        const isActive = value === item.id
        return (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            className={cn(
              "h-9 justify-start px-3 font-normal",
              isActive && "bg-muted hover:bg-muted"
            )}
            onClick={() => onValueChange(item.id)}
          >
            <item.icon className="mr-3 size-4 shrink-0" />
            {item.label}
          </Button>
        )
      })}
    </nav>
  )
}
