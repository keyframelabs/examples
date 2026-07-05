import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "default" | "ghost" | "destructive" | "outline";
type ButtonSize = "default" | "sm" | "icon" | "icon-sm";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "border border-teal-700 bg-teal-700 text-white shadow-sm hover:bg-teal-800",
  ghost:
    "border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100",
  destructive:
    "border border-transparent text-red-700 hover:border-red-100 hover:bg-red-50",
  outline:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-3 text-sm",
  sm: "h-8 px-2 text-xs",
  icon: "h-10 w-10",
  "icon-sm": "h-8 w-8"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      active = false,
      type = "button",
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active
          ? variantClasses.default
          : variant === "default"
            ? variantClasses.default
            : variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";
