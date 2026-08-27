import { type ButtonHTMLAttributes, type ComponentProps, forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "danger";
type Size = "default" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded font-semibold " +
  "transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan";

const variants: Record<Variant, string> = {
  primary:
    "bg-cyan text-sheet shadow-[var(--shadow-button)] hover:bg-cyan-hover hover:-translate-y-0.5 active:bg-cyan-pressed active:translate-y-0",
  secondary:
    "bg-sheet text-ink border-2 border-hairline hover:border-cyan hover:text-cyan hover:-translate-y-0.5",
  danger:
    "bg-transparent text-magenta border-2 border-magenta hover:bg-magenta hover:text-sheet hover:-translate-y-0.5",
};

// "lg" meets the App Flow doc's 52px minimum touch target for
// caregiver-facing screens (task 4.6) — everywhere else uses the
// default, smaller size.
const sizes: Record<Size, string> = {
  default: "px-4 py-2 text-[15px]",
  lg: "min-h-[52px] px-6 text-[17px]",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant = "primary", size = "default", className = "", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});

// A link styled to match — for navigation that should look like a button
// (the landing page's "Register"/"Get started"), since <button> can't be
// a real link.
export function LinkButton({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
}) {
  return <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
