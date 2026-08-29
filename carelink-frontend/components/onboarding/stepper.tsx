export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        Step {current + 1} of {steps.length} · {steps[current]}
      </p>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuenow={current + 1}
        aria-valuemin={1}
        aria-valuemax={steps.length}
      >
        {steps.map((step, i) => (
          <span
            key={step}
            className={`h-1.5 flex-1 rounded-full ${i <= current ? "bg-sage" : "bg-hairline"}`}
          />
        ))}
      </div>
    </div>
  );
}
