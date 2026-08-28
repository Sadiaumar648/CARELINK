import { type InputHTMLAttributes, forwardRef } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, id, className = "", ...props },
  ref,
) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={
          "rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink transition-colors " +
          "placeholder:text-ink-muted focus:border-sage focus:outline-none focus:ring-4 focus:ring-sage/15 " +
          (error ? "border-error " : "") +
          className
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
});
