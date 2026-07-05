import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        orientation === "vertical" ? "h-7 w-px" : "h-px w-full",
        "shrink-0 bg-slate-200",
        className
      )}
      {...props}
    />
  );
}
