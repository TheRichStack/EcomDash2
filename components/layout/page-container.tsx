import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export function PageContainer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:gap-8",
        className
      )}
      {...props}
    />
  )
}
