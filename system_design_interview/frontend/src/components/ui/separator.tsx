import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Separator = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden="true"
    className={cn("h-full w-px shrink-0 bg-border", className)}
    {...props}
  />
));
Separator.displayName = "Separator";
