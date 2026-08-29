import { type ButtonHTMLAttributes, type ComponentProps, forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "danger";
type Size = "default" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold font-heading " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage";

const variants: Record<Variant, string> = {
  primary: "bg-sage text-sheet hover:bg-sage-hover active:bg-sage-pressed",
  secondary: "bg-pistachio-tint text-ink border border-pistachio hover:border-sage hover:text-sage",
  danger: "bg-transparent text-error border border-error hover:bg-error hover:text-sheet",
};

// "lg" meets the App Flow doc's 52px minimum touch target for
// caregiver-facing screens — everywhere else uses the default size.
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

// A link styled to match — for navigation that should look like a button,
// since <button> can't be a real link.
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
