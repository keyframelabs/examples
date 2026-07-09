import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "#/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-slate-200 bg-white/95 text-slate-900 shadow-toolbar backdrop-blur",
        className
      )}
      {...props}
    />
  )
);

Card.displayName = "Card";
