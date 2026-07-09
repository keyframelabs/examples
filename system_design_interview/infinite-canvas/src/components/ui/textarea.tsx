import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "#/lib/utils";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-20 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm leading-5 text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";
