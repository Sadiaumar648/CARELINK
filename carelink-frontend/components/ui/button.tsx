import { type ButtonHTMLAttributes, type ComponentProps, forwardRef } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "danger";
type Size = "default" | "lg";

// Same color tokens as before for every variant — only the shape of the
// interaction is more current: a touch of elevation that lifts on
// hover, and a tactile scale-down on press (active:scale-[0.97]) rather
// than a flat color swap being the only feedback a tap gives.
const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold font-heading " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 " +
  "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 " +
  "motion-reduce:transition-none motion-reduce:active:scale-100 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wisteria";

const variants: Record<Variant, string> = {
  primary:
    "bg-wisteria text-sheet shadow-[var(--shadow-button)] " +
    "hover:bg-wisteria-hover hover:shadow-[var(--shadow-button-hover)] " +
    "active:bg-wisteria-pressed active:shadow-[var(--shadow-button-active)]",
  secondary:
    "bg-pistachio-tint text-ink border border-pistachio hover:border-wisteria hover:text-wisteria",
  danger:
    "bg-transparent text-error border border-error hover:bg-error hover:text-sheet hover:shadow-[var(--shadow-button-danger-hover)]",
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
