"use client"

import { LaptopMinimalIcon, MoonStarIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMounted } from "@/hooks/use-mounted"

const themeOptions = [
  {
    label: "Light",
    value: "light",
    icon: SunIcon,
  },
  {
    label: "Dark",
    value: "dark",
    icon: MoonStarIcon,
  },
  {
    label: "System",
    value: "system",
    icon: LaptopMinimalIcon,
  },
] as const

export function ThemeToggle() {
  const mounted = useMounted()
  const { setTheme, theme } = useTheme()

  const activeTheme =
    themeOptions.find((option) => option.value === theme) ?? themeOptions[2]
  const ActiveIcon = activeTheme.icon

  if (!mounted) {
    return (
      <Button variant="outline" size="icon-sm" disabled>
        <SunIcon />
        <span className="sr-only">Theme menu</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm">
          <ActiveIcon />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {themeOptions.map((option) => {
            const Icon = option.icon

            return (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setTheme(option.value)}
              >
                <Icon />
                {option.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
