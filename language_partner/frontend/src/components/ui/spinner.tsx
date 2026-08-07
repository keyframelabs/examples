import * as React from "react"

import { cn } from "@/lib/utils"

function Spinner({
  className,
  variant = "ring",
  ...props
}: React.ComponentProps<"span"> & { variant?: "ring" | "dots" }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        variant === "ring"
          ? "inline-block size-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-foreground motion-reduce:animate-none"
          : "inline-flex h-4 items-center gap-1 px-0.5",
        className
      )}
      {...props}
    >
      {variant === "dots" && [0, 1, 2].map((index) => (
        <span aria-hidden="true" className="typing-dot size-1.5 rounded-full bg-muted-foreground" key={index} />
      ))}
    </span>
  )
}

export { Spinner }
