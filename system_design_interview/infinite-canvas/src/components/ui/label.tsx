import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "#/lib/utils";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "block text-xs font-medium leading-none text-slate-600",
        className
      )}
      {...props}
    />
  )
);

Label.displayName = "Label";
