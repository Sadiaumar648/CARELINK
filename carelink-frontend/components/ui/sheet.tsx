import type { ComponentPropsWithoutRef } from "react";

type DivProps = { as?: "div" } & ComponentPropsWithoutRef<"div">;
type FormProps = { as: "form" } & ComponentPropsWithoutRef<"form">;

// A "sheet"/card: a lifted surface (card, modal, panel, or a form
// living inside one). Subtle border, light shadow — never heavy.
export function Sheet({ as, className = "", ...props }: DivProps | FormProps) {
  const sheetClassName = `rounded-[18px] border border-hairline bg-sheet p-6 shadow-[var(--shadow-card)] ${className}`;
  if (as === "form") {
    return <form className={sheetClassName} {...(props as ComponentPropsWithoutRef<"form">)} />;
  }
  return <div className={sheetClassName} {...(props as ComponentPropsWithoutRef<"div">)} />;
}
