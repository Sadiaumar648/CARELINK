import { type ButtonHTMLAttributes, forwardRef } from "react";
import Link, { type LinkProps } from "next/link";

type Variant = "primary" | "secondary" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-[15px] font-semibold " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan";

const variants: Record<Variant, string> = {
  primary: "bg-cyan text-sheet hover:bg-cyan-hover active:bg-cyan-pressed",
  secondary: "bg-transparent text-ink border border-hairline hover:border-ink",
  danger: "bg-transparent text-magenta border border-magenta hover:bg-magenta hover:text-sheet",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = "primary", className = "", ...props }, ref) {
  return <button ref={ref} className={`${base} ${variants[variant]} ${className}`} {...props} />;
});

// A link styled to match — for navigation that should look like a button
// (the landing page's "Register"/"Get started"), since <button> can't be
// a real link.
export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: LinkProps & { variant?: Variant; className?: string; children: React.ReactNode }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
