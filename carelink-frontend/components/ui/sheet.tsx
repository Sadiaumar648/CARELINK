import type { ComponentPropsWithoutRef } from "react";

type DivProps = { as?: "div" } & ComponentPropsWithoutRef<"div">;
type FormProps = { as: "form" } & ComponentPropsWithoutRef<"form">;

// A "sheet" per the Design Brief: a lifted surface (card, modal, panel,
// or a form living inside one). The one place shadow is used at all —
// never for plain page sectioning.
export function Sheet({ as, className = "", ...props }: DivProps | FormProps) {
  const sheetClassName = `rounded bg-sheet p-6 shadow-[var(--shadow-sheet)] ${className}`;
  if (as === "form") {
    return <form className={sheetClassName} {...(props as ComponentPropsWithoutRef<"form">)} />;
  }
  return <div className={sheetClassName} {...(props as ComponentPropsWithoutRef<"div">)} />;
}
