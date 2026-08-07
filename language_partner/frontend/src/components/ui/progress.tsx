import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  max = 100,
  segmented = false,
  segments = 3,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  segmented?: boolean
  segments?: number
}) {
  const currentValue = value ?? 0

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        segmented
          ? "grid grid-flow-col gap-1.5"
          : "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      max={max}
      value={currentValue}
      {...props}
    >
      {segmented ? Array.from({ length: segments }, (_, index) => (
        <span
          aria-hidden="true"
          className={cn(
            "power-meter-segment",
            currentValue >= (max / segments) * (index + 1) && "power-meter-segment--lit"
          )}
          key={index}
        />
      )) : (
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="h-full w-full flex-1 bg-primary transition-all"
          style={{ transform: `translateX(-${100 - (currentValue / max) * 100}%)` }}
        />
      )}
    </ProgressPrimitive.Root>
  )
}

export { Progress }
