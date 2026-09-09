import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm" | "icon";
};

export function Button({ className, variant = "primary", size = "default", ...props }: ButtonProps) {
  const variants = {
    primary: "bg-brand text-brand-foreground shadow-sm hover:bg-brand-hover",
    secondary: "border border-line bg-surface text-ink shadow-sm hover:border-line-strong hover:bg-surface-hover",
    ghost: "bg-transparent text-ink-secondary hover:bg-surface-hover hover:text-ink",
    danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-500",
  };
  const sizes = {
    default: "h-10 rounded-lg px-4 text-sm",
    sm: "h-9 rounded-lg px-3 text-xs",
    icon: "h-10 w-10 rounded-lg",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
