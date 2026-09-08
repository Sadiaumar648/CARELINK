import { type InputHTMLAttributes, forwardRef, useState } from "react";
import type { Icon } from "@phosphor-icons/react";
import { Eye, EyeSlash } from "@phosphor-icons/react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  /** Optional leading icon — purely additive, every existing caller renders unchanged without it. */
  icon?: Icon;
  /** Adds a show/hide eye button for a type="password" field. No-op on any other type. */
  showPasswordToggle?: boolean;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, id, className = "", icon: IconComponent, showPasswordToggle, type, ...props },
  ref,
) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const [revealed, setRevealed] = useState(false);
  const isPasswordToggle = showPasswordToggle && type === "password";
  const resolvedType = isPasswordToggle ? (revealed ? "text" : "password") : type;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
      >
        {label}
      </label>
      <div className="relative">
        {IconComponent && (
          <IconComponent
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          type={resolvedType}
          className={
            "w-full rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink transition-colors " +
            "placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15 " +
            (IconComponent ? "pl-10 " : "") +
            (isPasswordToggle ? "pr-10 " : "") +
            (error ? "border-error " : "") +
            className
          }
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {isPasswordToggle && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            aria-label={revealed ? "Hide password" : "Show password"}
          >
            {revealed ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
});
